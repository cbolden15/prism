#define NAPI_VERSION 8

#include <node_api.h>

#include <fcntl.h>
#include <dirent.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <stdio.h>
#include <stdlib.h>
#endif

#if defined(__linux__)
#include <sys/syscall.h>
#endif

#include <array>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

namespace {

constexpr size_t kMaxRootPathBytes = 4096;
constexpr size_t kMaxPluginIdBytes = 64;
constexpr size_t kMaxScaffoldFileBytes = 262144;
constexpr size_t kMaxManifestBytes = 65536;
constexpr size_t kContractMaxScaffoldBytes = 1000000;
constexpr size_t kMaxClosedScaffoldBytes = (3 * kMaxScaffoldFileBytes) + kMaxManifestBytes;
constexpr size_t kStageRetries = 32;

static_assert(kMaxClosedScaffoldBytes <= kContractMaxScaffoldBytes);

constexpr char kMarkerName[] = ".prism-authoring-root-v1";
constexpr char kMarkerContents[] = "prism-managed-authoring-root-v1\n";
constexpr char kStagePrefix[] = ".prism-authoring-stage-v1-";
constexpr std::array<const char*, 4> kScaffoldNames = {
    "README.md",
    "index.mjs",
    "index.test.mjs",
    "manifest.json",
};

enum class FailureCode {
  kRootParentMissing,
  kRootParentNotDirectory,
  kRootParentSymlink,
  kRootUnmanaged,
  kRootInvalid,
  kRootBusy,
  kRootChanged,
  kDestinationExists,
  kCreateFailed,
  kCleanupFailed,
};

const char* FailureName(FailureCode code) {
  switch (code) {
    case FailureCode::kRootParentMissing:
      return "root-parent-missing";
    case FailureCode::kRootParentNotDirectory:
      return "root-parent-not-directory";
    case FailureCode::kRootParentSymlink:
      return "root-parent-symlink";
    case FailureCode::kRootUnmanaged:
      return "root-unmanaged";
    case FailureCode::kRootInvalid:
      return "root-invalid";
    case FailureCode::kRootBusy:
      return "root-busy";
    case FailureCode::kRootChanged:
      return "root-changed";
    case FailureCode::kDestinationExists:
      return "destination-exists";
    case FailureCode::kCreateFailed:
      return "create-failed";
    case FailureCode::kCleanupFailed:
      return "cleanup-failed";
  }
  return "create-failed";
}

class Failure final {
 public:
  explicit Failure(FailureCode value) : value(value) {}

  FailureCode value;
};

[[noreturn]] void Fail(FailureCode code) {
  throw Failure(code);
}

class Fd final {
 public:
  Fd() = default;
  explicit Fd(int value) : value_(value) {}
  ~Fd() { Reset(); }

  Fd(const Fd&) = delete;
  Fd& operator=(const Fd&) = delete;

  Fd(Fd&& other) noexcept : value_(other.Release()) {}

  Fd& operator=(Fd&& other) noexcept {
    if (this != &other) {
      Reset();
      value_ = other.Release();
    }
    return *this;
  }

  [[nodiscard]] int Get() const { return value_; }
  [[nodiscard]] bool Valid() const { return value_ >= 0; }

  int Release() {
    const int result = value_;
    value_ = -1;
    return result;
  }

  void Reset(int value = -1) {
    if (value_ >= 0) {
      (void)close(value_);
    }
    value_ = value;
  }

 private:
  int value_ = -1;
};

bool CloseChecked(Fd* descriptor) {
  if (descriptor == nullptr || !descriptor->Valid()) return false;
  const int value = descriptor->Release();
  return close(value) == 0;
}

bool SyncChecked(Fd* descriptor) {
  if (descriptor == nullptr || !descriptor->Valid()) return false;
#if defined(PRISM_AUTHORING_TEST_FORCE_FIRST_SYNC_FAILURE)
  static bool forced_failure = false;
  if (!forced_failure) {
    forced_failure = true;
    return false;
  }
#endif
  return fsync(descriptor->Get()) == 0;
}

bool SyncAndClose(Fd* descriptor) {
  if (descriptor == nullptr || !descriptor->Valid()) return false;
  const bool synced = SyncChecked(descriptor);
  const int value = descriptor->Release();
  const bool closed = close(value) == 0;
  return synced && closed;
}

struct Identity {
  dev_t dev = 0;
  ino_t ino = 0;
};

Identity IdentityFrom(const struct stat& value) {
  return {value.st_dev, value.st_ino};
}

bool SameIdentity(const Identity& left, const struct stat& right) {
  return left.dev == right.st_dev && left.ino == right.st_ino;
}

bool ExactMode(const struct stat& value, mode_t expected) {
  return (value.st_mode & 07777) == expected;
}

void ClearPendingException(napi_env env) {
  bool pending = false;
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending) {
    napi_value ignored;
    (void)napi_get_and_clear_last_exception(env, &ignored);
  }
}

void RequireNapi(napi_env env, napi_status status) {
  if (status == napi_ok) return;
  ClearPendingException(env);
  Fail(FailureCode::kCreateFailed);
}

void RequireType(napi_env env, napi_value value, napi_valuetype expected) {
  napi_valuetype actual;
  RequireNapi(env, napi_typeof(env, value, &actual));
  if (actual != expected) Fail(FailureCode::kCreateFailed);
}

napi_value GetGlobalConstructor(napi_env env, const char* name) {
  napi_value global;
  napi_value constructor;
  RequireNapi(env, napi_get_global(env, &global));
  RequireNapi(env, napi_get_named_property(env, global, name, &constructor));
  RequireType(env, constructor, napi_function);
  return constructor;
}

napi_value GetPrototype(napi_env env, napi_value constructor) {
  napi_value prototype;
  RequireNapi(env, napi_get_named_property(env, constructor, "prototype", &prototype));
  RequireType(env, prototype, napi_object);
  return prototype;
}

void RequirePrototype(napi_env env, napi_value value, const char* constructor_name) {
  napi_value prototype;
  napi_value expected;
  bool same = false;
  RequireNapi(env, napi_get_prototype(env, value, &prototype));
  expected = GetPrototype(env, GetGlobalConstructor(env, constructor_name));
  RequireNapi(env, napi_strict_equals(env, prototype, expected, &same));
  if (!same) Fail(FailureCode::kCreateFailed);
}

void RequirePlainObject(napi_env env, napi_value value) {
  RequireType(env, value, napi_object);
  bool array = false;
  RequireNapi(env, napi_is_array(env, value, &array));
  if (array) Fail(FailureCode::kCreateFailed);
  RequirePrototype(env, value, "Object");
}

void RequirePlainArray(napi_env env, napi_value value) {
  RequireType(env, value, napi_object);
  bool array = false;
  RequireNapi(env, napi_is_array(env, value, &array));
  if (!array) Fail(FailureCode::kCreateFailed);
  RequirePrototype(env, value, "Array");
}

napi_value GetOwnDescriptor(napi_env env, napi_value object, napi_value key) {
  napi_value object_constructor = GetGlobalConstructor(env, "Object");
  napi_value get_own_property_descriptor;
  napi_value arguments[2] = {object, key};
  napi_value descriptor;
  RequireNapi(env, napi_get_named_property(
      env,
      object_constructor,
      "getOwnPropertyDescriptor",
      &get_own_property_descriptor));
  RequireType(env, get_own_property_descriptor, napi_function);
  RequireNapi(env, napi_call_function(
      env,
      object_constructor,
      get_own_property_descriptor,
      2,
      arguments,
      &descriptor));
  return descriptor;
}

napi_value GetDataOwnProperty(
    napi_env env,
    napi_value object,
    const char* name,
    bool expected_enumerable) {
  napi_value key;
  napi_value descriptor;
  napi_value accessor;
  napi_value enumerable;
  napi_value value;
  napi_valuetype descriptor_type;
  napi_valuetype accessor_type;
  bool enumerable_value = false;

  RequireNapi(env, napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &key));
  descriptor = GetOwnDescriptor(env, object, key);
  RequireNapi(env, napi_typeof(env, descriptor, &descriptor_type));
  if (descriptor_type != napi_object) Fail(FailureCode::kCreateFailed);

  RequireNapi(env, napi_get_named_property(env, descriptor, "get", &accessor));
  RequireNapi(env, napi_typeof(env, accessor, &accessor_type));
  if (accessor_type != napi_undefined) Fail(FailureCode::kCreateFailed);
  RequireNapi(env, napi_get_named_property(env, descriptor, "set", &accessor));
  RequireNapi(env, napi_typeof(env, accessor, &accessor_type));
  if (accessor_type != napi_undefined) Fail(FailureCode::kCreateFailed);

  RequireNapi(env, napi_get_named_property(env, descriptor, "enumerable", &enumerable));
  RequireNapi(env, napi_get_value_bool(env, enumerable, &enumerable_value));
  if (enumerable_value != expected_enumerable) Fail(FailureCode::kCreateFailed);

  RequireNapi(env, napi_get_named_property(env, descriptor, "value", &value));
  return value;
}

std::string ReadString(napi_env env, napi_value value, size_t maximum_bytes) {
  size_t byte_count = 0;
  size_t copied = 0;
  RequireType(env, value, napi_string);
  RequireNapi(env, napi_get_value_string_utf8(env, value, nullptr, 0, &byte_count));
  if (byte_count > maximum_bytes) Fail(FailureCode::kCreateFailed);
  std::vector<char> bytes(byte_count + 1);
  RequireNapi(env, napi_get_value_string_utf8(
      env,
      value,
      bytes.data(),
      bytes.size(),
      &copied));
  if (copied != byte_count || std::memchr(bytes.data(), '\0', copied) != nullptr) {
    Fail(FailureCode::kCreateFailed);
  }
  return {bytes.data(), copied};
}

bool Matches(const std::string& value, const char* expected) {
  return value == expected;
}

void RequireExactOwnDataProperties(
    napi_env env,
    napi_value object,
    const std::vector<std::pair<const char*, bool>>& expected) {
  napi_value keys;
  uint32_t length = 0;
  RequireNapi(env, napi_get_all_property_names(
      env,
      object,
      napi_key_own_only,
      napi_key_all_properties,
      napi_key_numbers_to_strings,
      &keys));
  RequireNapi(env, napi_get_array_length(env, keys, &length));
  if (length != expected.size()) Fail(FailureCode::kCreateFailed);

  std::vector<bool> seen(expected.size(), false);
  for (uint32_t index = 0; index < length; ++index) {
    napi_value key;
    napi_valuetype key_type;
    RequireNapi(env, napi_get_element(env, keys, index, &key));
    RequireNapi(env, napi_typeof(env, key, &key_type));
    if (key_type != napi_string) Fail(FailureCode::kCreateFailed);
    const std::string name = ReadString(env, key, 64);
    bool found = false;
    for (size_t candidate = 0; candidate < expected.size(); ++candidate) {
      if (Matches(name, expected[candidate].first)) {
        if (seen[candidate]) Fail(FailureCode::kCreateFailed);
        seen[candidate] = true;
        found = true;
        break;
      }
    }
    if (!found) Fail(FailureCode::kCreateFailed);
  }

  for (size_t index = 0; index < expected.size(); ++index) {
    if (!seen[index]) Fail(FailureCode::kCreateFailed);
    (void)GetDataOwnProperty(env, object, expected[index].first, expected[index].second);
  }
}

void RequireFrozen(napi_env env, napi_value value) {
  napi_value object_constructor = GetGlobalConstructor(env, "Object");
  napi_value is_frozen;
  napi_value result;
  bool frozen = false;
  RequireNapi(env, napi_get_named_property(env, object_constructor, "isFrozen", &is_frozen));
  RequireType(env, is_frozen, napi_function);
  RequireNapi(env, napi_call_function(env, object_constructor, is_frozen, 1, &value, &result));
  RequireNapi(env, napi_get_value_bool(env, result, &frozen));
  if (!frozen) Fail(FailureCode::kCreateFailed);
}

bool IsPluginId(const std::string& value) {
  if (value.empty() || value.size() > kMaxPluginIdBytes) return false;
  const auto is_lower_or_digit = [](unsigned char character) {
    return (character >= 'a' && character <= 'z') ||
        (character >= '0' && character <= '9');
  };
  if (!is_lower_or_digit(static_cast<unsigned char>(value.front()))) return false;
  for (size_t index = 1; index < value.size(); ++index) {
    const unsigned char character = static_cast<unsigned char>(value[index]);
    if (!is_lower_or_digit(character) && character != '-') return false;
  }
  return true;
}

std::vector<std::string> ParseRootPath(const std::string& root_path) {
  if (root_path.size() < 2 || root_path.front() != '/') Fail(FailureCode::kCreateFailed);

  std::vector<std::string> components;
  size_t start = 1;
  while (start < root_path.size()) {
    const size_t end = root_path.find('/', start);
    const size_t length = end == std::string::npos ? root_path.size() - start : end - start;
    if (length == 0) Fail(FailureCode::kCreateFailed);
    const std::string component = root_path.substr(start, length);
    if (component == "." || component == "..") Fail(FailureCode::kCreateFailed);
    components.push_back(component);
    if (end == std::string::npos) break;
    start = end + 1;
  }
  if (components.empty()) Fail(FailureCode::kCreateFailed);
  return components;
}

struct ScaffoldFile {
  std::string path;
  std::string contents;
};

struct Input {
  std::vector<std::string> root_components;
  std::string plugin_id;
  std::array<ScaffoldFile, 4> scaffold;
};

Input ParseInput(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  RequireNapi(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
  if (argc != 1) Fail(FailureCode::kCreateFailed);

  napi_value input = argv[0];
  RequirePlainObject(env, input);
  RequireExactOwnDataProperties(
      env,
      input,
      {{"rootPath", true}, {"pluginId", true}, {"scaffold", true}});

  napi_value root_path_value = GetDataOwnProperty(env, input, "rootPath", true);
  napi_value plugin_id_value = GetDataOwnProperty(env, input, "pluginId", true);
  napi_value scaffold_value = GetDataOwnProperty(env, input, "scaffold", true);
  const std::string root_path = ReadString(env, root_path_value, kMaxRootPathBytes);
  const std::string plugin_id = ReadString(env, plugin_id_value, kMaxPluginIdBytes);
  if (!IsPluginId(plugin_id)) Fail(FailureCode::kCreateFailed);

  RequirePlainArray(env, scaffold_value);
  RequireFrozen(env, scaffold_value);
  RequireExactOwnDataProperties(
      env,
      scaffold_value,
      {{"0", true}, {"1", true}, {"2", true}, {"3", true}, {"length", false}});

  Input parsed = {ParseRootPath(root_path), plugin_id, {}};
  for (size_t index = 0; index < parsed.scaffold.size(); ++index) {
    const std::string key = std::to_string(index);
    napi_value raw_file = GetDataOwnProperty(env, scaffold_value, key.c_str(), true);
    RequirePlainObject(env, raw_file);
    RequireFrozen(env, raw_file);
    RequireExactOwnDataProperties(env, raw_file, {{"path", true}, {"contents", true}});
    napi_value path_value = GetDataOwnProperty(env, raw_file, "path", true);
    napi_value contents_value = GetDataOwnProperty(env, raw_file, "contents", true);
    const std::string path = ReadString(env, path_value, 255);
    if (path.find('/') != std::string::npos || path.find('\\') != std::string::npos ||
        !Matches(path, kScaffoldNames[index])) {
      Fail(FailureCode::kCreateFailed);
    }
    const std::string contents = ReadString(env, contents_value, kMaxScaffoldFileBytes);
    if (path == "manifest.json" && contents.size() > kMaxManifestBytes) {
      Fail(FailureCode::kCreateFailed);
    }
    parsed.scaffold[index] = {path, contents};
  }
  return parsed;
}

void ReadStat(int fd, struct stat* value) {
  if (fstat(fd, value) != 0) Fail(FailureCode::kCreateFailed);
}

void RequireDirectory(const struct stat& value, FailureCode not_directory) {
  if (S_ISLNK(value.st_mode)) Fail(FailureCode::kRootParentSymlink);
  if (!S_ISDIR(value.st_mode)) Fail(not_directory);
}

[[noreturn]] void FailForParentOpenError(int parent_fd, const std::string& name, int error) {
  if (error == ENOENT) Fail(FailureCode::kRootParentMissing);
  if (error == ELOOP) Fail(FailureCode::kRootParentSymlink);
  if (error == ENOTDIR) {
    struct stat current;
    if (fstatat(parent_fd, name.c_str(), &current, AT_SYMLINK_NOFOLLOW) == 0 &&
        S_ISLNK(current.st_mode)) {
      Fail(FailureCode::kRootParentSymlink);
    }
    Fail(FailureCode::kRootParentNotDirectory);
  }
  Fail(FailureCode::kCreateFailed);
}

struct RootAncestor {
  Fd directory;
  Identity identity;
  std::string name;
};

struct RootParent {
  std::vector<RootAncestor> ancestors;
  std::string root_name;

  int DirectoryFd() const {
    return ancestors.empty() ? -1 : ancestors.back().directory.Get();
  }
};

RootParent OpenRootParent(const std::vector<std::string>& components) {
  Fd current(open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC));
  if (!current.Valid()) Fail(FailureCode::kCreateFailed);
  struct stat root_stat;
  ReadStat(current.Get(), &root_stat);
  RequireDirectory(root_stat, FailureCode::kRootParentNotDirectory);

  std::vector<RootAncestor> ancestors;
  ancestors.push_back({std::move(current), IdentityFrom(root_stat), ""});

  for (size_t index = 0; index + 1 < components.size(); ++index) {
    const std::string& component = components[index];
    const int parent_fd = ancestors.back().directory.Get();
    struct stat named;
    if (fstatat(parent_fd, component.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0) {
      FailForParentOpenError(parent_fd, component, errno);
    }
    RequireDirectory(named, FailureCode::kRootParentNotDirectory);

    const int child_fd = openat(
        parent_fd,
        component.c_str(),
        O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (child_fd < 0) FailForParentOpenError(parent_fd, component, errno);
    Fd child(child_fd);
    struct stat opened;
    ReadStat(child.Get(), &opened);
    RequireDirectory(opened, FailureCode::kRootParentNotDirectory);
    if (!SameIdentity(IdentityFrom(named), opened)) Fail(FailureCode::kRootChanged);
    ancestors.push_back({std::move(child), IdentityFrom(opened), component});
  }

  return {std::move(ancestors), components.back()};
}

bool ParentPathMatches(const RootParent& parent) {
  if (parent.ancestors.empty()) return false;
  for (size_t index = 0; index < parent.ancestors.size(); ++index) {
    const RootAncestor& ancestor = parent.ancestors[index];
    struct stat held;
    if (fstat(ancestor.directory.Get(), &held) != 0 || !S_ISDIR(held.st_mode) ||
        !SameIdentity(ancestor.identity, held)) {
      return false;
    }
    if (index == 0) continue;
    const RootAncestor& previous = parent.ancestors[index - 1];
    struct stat named;
    if (fstatat(
            previous.directory.Get(),
            ancestor.name.c_str(),
            &named,
            AT_SYMLINK_NOFOLLOW) != 0 ||
        !S_ISDIR(named.st_mode) || S_ISLNK(named.st_mode) ||
        !SameIdentity(ancestor.identity, named)) {
      return false;
    }
  }
  return true;
}

bool CloseRootParent(RootParent* parent, bool sync_parent) {
  if (parent == nullptr || parent->ancestors.empty()) return false;
  bool valid = true;
  if (sync_parent && !SyncChecked(&parent->ancestors.back().directory)) valid = false;
  for (auto ancestor = parent->ancestors.rbegin(); ancestor != parent->ancestors.rend(); ++ancestor) {
    if (ancestor->directory.Valid() && !CloseChecked(&ancestor->directory)) valid = false;
  }
  return valid;
}

struct CreatedEntry {
  std::string name;
  Identity identity;
};

struct NestedDirectory {
  std::string name;
  Identity identity;
  Fd directory;
  std::vector<CreatedEntry> entries;
  bool has_identity = false;
};

struct Stage {
  int parent_fd = -1;
  std::string name;
  Identity identity;
  Fd directory;
  std::vector<CreatedEntry> entries;
  NestedDirectory plugin_directory;
  bool has_identity = false;
  bool published = false;
};

bool StageMatches(const Stage& stage) {
  if (!stage.has_identity) return false;
  struct stat named;
  if (stage.directory.Valid()) {
    struct stat held;
    if (fstat(stage.directory.Get(), &held) != 0 || !S_ISDIR(held.st_mode) ||
        !SameIdentity(stage.identity, held)) {
      return false;
    }
  }
  if (fstatat(stage.parent_fd, stage.name.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
      !S_ISDIR(named.st_mode) || !SameIdentity(stage.identity, named)) {
    return false;
  }
  return true;
}

bool ReopenStage(Stage* stage) {
  if (stage == nullptr || !stage->has_identity) return false;
  if (stage->directory.Valid()) return StageMatches(*stage);
  struct stat named;
  if (fstatat(stage->parent_fd, stage->name.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
      !S_ISDIR(named.st_mode) || !SameIdentity(stage->identity, named)) {
    return false;
  }
  const int directory_fd = openat(
      stage->parent_fd,
      stage->name.c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (directory_fd < 0) return false;
  Fd directory(directory_fd);
  struct stat opened;
  if (fstat(directory.Get(), &opened) != 0 || !S_ISDIR(opened.st_mode) ||
      !SameIdentity(stage->identity, opened)) {
    return false;
  }
  stage->directory = std::move(directory);
  return true;
}

bool NestedDirectoryMatches(const Stage& stage) {
  const NestedDirectory& nested = stage.plugin_directory;
  if (!nested.has_identity || !stage.directory.Valid() || !StageMatches(stage)) return false;
  struct stat named;
  if (nested.directory.Valid()) {
    struct stat held;
    if (fstat(nested.directory.Get(), &held) != 0 || !S_ISDIR(held.st_mode) ||
        !SameIdentity(nested.identity, held)) {
      return false;
    }
  }
  if (fstatat(stage.directory.Get(), nested.name.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
      !S_ISDIR(named.st_mode) || !SameIdentity(nested.identity, named)) {
    return false;
  }
  return true;
}

bool ReopenNestedDirectory(Stage* stage) {
  if (!ReopenStage(stage) || !stage->plugin_directory.has_identity) return false;
  NestedDirectory& nested = stage->plugin_directory;
  if (nested.directory.Valid()) return NestedDirectoryMatches(*stage);
  struct stat named;
  if (fstatat(stage->directory.Get(), nested.name.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
      !S_ISDIR(named.st_mode) || !SameIdentity(nested.identity, named)) {
    return false;
  }
  const int directory_fd = openat(
      stage->directory.Get(),
      nested.name.c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (directory_fd < 0) return false;
  Fd directory(directory_fd);
  struct stat opened;
  if (fstat(directory.Get(), &opened) != 0 || !S_ISDIR(opened.st_mode) ||
      !SameIdentity(nested.identity, opened)) {
    return false;
  }
  nested.directory = std::move(directory);
  return true;
}

bool CleanupNestedDirectory(Stage* stage) {
  NestedDirectory& nested = stage->plugin_directory;
  if (!nested.has_identity) return true;
  if (!ReopenNestedDirectory(stage) || !NestedDirectoryMatches(*stage)) return false;

  for (auto entry = nested.entries.rbegin(); entry != nested.entries.rend(); ++entry) {
    if (!NestedDirectoryMatches(*stage)) return false;
    struct stat current;
    if (fstatat(nested.directory.Get(), entry->name.c_str(), &current, AT_SYMLINK_NOFOLLOW) != 0) {
      if (errno == ENOENT) continue;
      return false;
    }
    if (!S_ISREG(current.st_mode) || !SameIdentity(entry->identity, current)) return false;
    if (unlinkat(nested.directory.Get(), entry->name.c_str(), 0) != 0) return false;
  }

  if (!NestedDirectoryMatches(*stage)) return false;
  if (!SyncAndClose(&nested.directory)) return false;
  if (unlinkat(stage->directory.Get(), nested.name.c_str(), AT_REMOVEDIR) != 0) return false;
  nested.has_identity = false;
  return true;
}

bool CleanupStage(Stage* stage) {
  if (stage == nullptr || stage->published) return true;
  if (!ReopenStage(stage) || !StageMatches(*stage)) return false;
  if (!CleanupNestedDirectory(stage)) return false;

  for (auto entry = stage->entries.rbegin(); entry != stage->entries.rend(); ++entry) {
    if (!StageMatches(*stage)) return false;
    struct stat current;
    if (fstatat(stage->directory.Get(), entry->name.c_str(), &current, AT_SYMLINK_NOFOLLOW) != 0) {
      if (errno == ENOENT) continue;
      return false;
    }
    if (!S_ISREG(current.st_mode) || !SameIdentity(entry->identity, current)) return false;
    if (unlinkat(stage->directory.Get(), entry->name.c_str(), 0) != 0) return false;
  }

  if (!StageMatches(*stage)) return false;
  if (!SyncAndClose(&stage->directory)) return false;
  if (unlinkat(stage->parent_fd, stage->name.c_str(), AT_REMOVEDIR) != 0) return false;
  return fsync(stage->parent_fd) == 0;
}

bool FillRandom(std::array<unsigned char, 16>* bytes) {
#if defined(__APPLE__)
  arc4random_buf(bytes->data(), bytes->size());
  return true;
#elif defined(__linux__)
  size_t offset = 0;
  while (offset < bytes->size()) {
    const long result = syscall(
        SYS_getrandom,
        bytes->data() + offset,
        bytes->size() - offset,
        0);
    if (result > 0) {
      offset += static_cast<size_t>(result);
      continue;
    }
    if (result < 0 && errno == EINTR) continue;
    return false;
  }
  return true;
#else
  return false;
#endif
}

std::string StageName() {
  std::array<unsigned char, 16> bytes{};
  if (!FillRandom(&bytes)) Fail(FailureCode::kCreateFailed);
  static constexpr char hex[] = "0123456789abcdef";
  std::string result(kStagePrefix);
  result.reserve(result.size() + bytes.size() * 2);
  for (const unsigned char byte : bytes) {
    result.push_back(hex[(byte >> 4U) & 0x0FU]);
    result.push_back(hex[byte & 0x0FU]);
  }
  return result;
}

Stage CreateStage(int parent_fd) {
  for (size_t attempt = 0; attempt < kStageRetries; ++attempt) {
    Stage stage;
    stage.parent_fd = parent_fd;
    stage.name = StageName();
    if (mkdirat(parent_fd, stage.name.c_str(), 0700) != 0) {
      if (errno == EEXIST) continue;
      Fail(FailureCode::kCreateFailed);
    }

    try {
      const int directory_fd = openat(
          parent_fd,
          stage.name.c_str(),
          O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
      if (directory_fd < 0) Fail(FailureCode::kCreateFailed);
      stage.directory = Fd(directory_fd);
      struct stat directory_stat;
      ReadStat(stage.directory.Get(), &directory_stat);
      if (!S_ISDIR(directory_stat.st_mode)) Fail(FailureCode::kCreateFailed);
      stage.identity = IdentityFrom(directory_stat);
      stage.has_identity = true;
      if (fchmod(stage.directory.Get(), 0700) != 0) Fail(FailureCode::kCreateFailed);
      if (flock(stage.directory.Get(), LOCK_EX | LOCK_NB) != 0) {
        if (errno == EACCES || errno == EAGAIN || errno == EWOULDBLOCK) {
          Fail(FailureCode::kRootBusy);
        }
        Fail(FailureCode::kCreateFailed);
      }
      return stage;
    } catch (const Failure& error) {
      if (!CleanupStage(&stage)) Fail(FailureCode::kCleanupFailed);
      throw error;
    } catch (...) {
      if (!CleanupStage(&stage)) Fail(FailureCode::kCleanupFailed);
      Fail(FailureCode::kCreateFailed);
    }
  }
  Fail(FailureCode::kCreateFailed);
}

void WriteAll(int fd, const std::string& contents) {
  size_t offset = 0;
  while (offset < contents.size()) {
    const ssize_t written = write(fd, contents.data() + offset, contents.size() - offset);
    if (written > 0) {
      offset += static_cast<size_t>(written);
      continue;
    }
    if (written < 0 && errno == EINTR) continue;
    Fail(FailureCode::kCreateFailed);
  }
}

void WriteDirectoryFile(
    int directory_fd,
    std::vector<CreatedEntry>* entries,
    const ScaffoldFile& file,
    mode_t mode) {
  const int file_fd = openat(
      directory_fd,
      file.path.c_str(),
      O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
      mode);
  if (file_fd < 0) Fail(FailureCode::kCreateFailed);
  Fd descriptor(file_fd);

  struct stat opened;
  if (fstat(descriptor.Get(), &opened) != 0 || !S_ISREG(opened.st_mode)) {
    Fail(FailureCode::kCreateFailed);
  }
  entries->push_back({file.path, IdentityFrom(opened)});
  if (fchmod(descriptor.Get(), mode) != 0) Fail(FailureCode::kCreateFailed);
  WriteAll(descriptor.Get(), file.contents);
  struct stat written;
  if (fstat(descriptor.Get(), &written) != 0 || !S_ISREG(written.st_mode) ||
      !SameIdentity(entries->back().identity, written) ||
      !ExactMode(written, mode) || written.st_size != static_cast<off_t>(file.contents.size())) {
    Fail(FailureCode::kCreateFailed);
  }
  if (!SyncAndClose(&descriptor)) Fail(FailureCode::kCleanupFailed);
}

void WriteMarker(Stage* stage) {
  WriteDirectoryFile(
      stage->directory.Get(),
      &stage->entries,
      {kMarkerName, kMarkerContents},
      0600);
}

void WriteScaffold(
    int directory_fd,
    std::vector<CreatedEntry>* entries,
    const std::array<ScaffoldFile, 4>& scaffold) {
  for (const ScaffoldFile& file : scaffold) {
    WriteDirectoryFile(directory_fd, entries, file, 0644);
  }
}

void CreatePluginDirectory(Stage* stage, const std::string& name) {
  if (!StageMatches(*stage)) Fail(FailureCode::kRootChanged);
  NestedDirectory& nested = stage->plugin_directory;
  nested.name = name;
  if (mkdirat(stage->directory.Get(), name.c_str(), 0700) != 0) {
    Fail(FailureCode::kCreateFailed);
  }
  const int directory_fd = openat(
      stage->directory.Get(),
      name.c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (directory_fd < 0) Fail(FailureCode::kCreateFailed);
  nested.directory = Fd(directory_fd);
  struct stat directory_stat;
  ReadStat(nested.directory.Get(), &directory_stat);
  if (!S_ISDIR(directory_stat.st_mode)) Fail(FailureCode::kCreateFailed);
  nested.identity = IdentityFrom(directory_stat);
  nested.has_identity = true;
  if (fchmod(nested.directory.Get(), 0700) != 0) Fail(FailureCode::kCreateFailed);
}

bool FinalizeStage(Stage* stage, bool close_stage_directory) {
  if (stage == nullptr || !StageMatches(*stage)) return false;
  if (stage->plugin_directory.has_identity) {
    if (!NestedDirectoryMatches(*stage) || !SyncAndClose(&stage->plugin_directory.directory)) {
      return false;
    }
  }
  if (!StageMatches(*stage)) return false;
  return close_stage_directory
    ? SyncAndClose(&stage->directory)
    : SyncChecked(&stage->directory);
}

bool ReadExact(int fd, const char* expected, size_t expected_size) {
  std::vector<char> contents(expected_size + 1);
  size_t offset = 0;
  while (offset < expected_size) {
    const ssize_t count = read(fd, contents.data() + offset, expected_size - offset);
    if (count > 0) {
      offset += static_cast<size_t>(count);
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    return false;
  }
  char extra = '\0';
  while (true) {
    const ssize_t count = read(fd, &extra, 1);
    if (count == 0) break;
    if (count < 0 && errno == EINTR) continue;
    return false;
  }
  return std::memcmp(contents.data(), expected, expected_size) == 0;
}

void ValidateMarker(int root_fd, bool absent_is_unmanaged) {
  struct stat marker_stat;
  if (fstatat(root_fd, kMarkerName, &marker_stat, AT_SYMLINK_NOFOLLOW) != 0) {
    if (errno == ENOENT && absent_is_unmanaged) Fail(FailureCode::kRootUnmanaged);
    Fail(FailureCode::kRootInvalid);
  }
  if (
      !S_ISREG(marker_stat.st_mode) || !ExactMode(marker_stat, 0600) ||
      marker_stat.st_uid != geteuid() ||
      marker_stat.st_size != static_cast<off_t>(sizeof(kMarkerContents) - 1)) {
    Fail(FailureCode::kRootInvalid);
  }
  const int marker_fd = openat(root_fd, kMarkerName, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (marker_fd < 0) Fail(FailureCode::kRootInvalid);
  Fd marker(marker_fd);
  struct stat opened;
  const bool valid = fstat(marker.Get(), &opened) == 0 && S_ISREG(opened.st_mode) &&
      SameIdentity(IdentityFrom(marker_stat), opened) && ExactMode(opened, 0600) &&
      opened.st_uid == geteuid() &&
      ReadExact(marker.Get(), kMarkerContents, sizeof(kMarkerContents) - 1);
  if (!CloseChecked(&marker)) Fail(FailureCode::kCleanupFailed);
  if (!valid) Fail(FailureCode::kRootInvalid);
}

void ValidateManagedRoot(
    int root_fd,
    const Identity& expected_identity,
    bool absent_marker_is_unmanaged = false) {
  struct stat root_stat;
  if (fstat(root_fd, &root_stat) != 0 || !S_ISDIR(root_stat.st_mode) ||
      !SameIdentity(expected_identity, root_stat)) {
    Fail(FailureCode::kRootChanged);
  }
  if (root_stat.st_uid != geteuid() || !ExactMode(root_stat, 0700)) {
    Fail(FailureCode::kRootInvalid);
  }
  ValidateMarker(root_fd, absent_marker_is_unmanaged);
}

enum class RenameResult {
  kSuccess,
  kExists,
  kFailure,
};

RenameResult RenameNoReplace(int source_directory, const char* source, int destination_directory, const char* destination) {
#if defined(__linux__)
  constexpr unsigned int kRenameNoReplace = 1U;
  if (syscall(
          SYS_renameat2,
          source_directory,
          source,
          destination_directory,
          destination,
          kRenameNoReplace) == 0) {
    return RenameResult::kSuccess;
  }
#elif defined(__APPLE__)
  if (renameatx_np(source_directory, source, destination_directory, destination, RENAME_EXCL) == 0) {
    return RenameResult::kSuccess;
  }
#else
  errno = ENOSYS;
#endif
  return errno == EEXIST ? RenameResult::kExists : RenameResult::kFailure;
}

void RequireNamedIdentity(
    int parent_fd,
    const char* name,
    const Identity& expected,
    FailureCode failure) {
  struct stat current;
  if (fstatat(parent_fd, name, &current, AT_SYMLINK_NOFOLLOW) != 0 ||
      !SameIdentity(expected, current)) {
    Fail(failure);
  }
}

bool HasExactScaffold(int plugin_fd, const std::array<ScaffoldFile, 4>& scaffold) {
  const int scan_fd = dup(plugin_fd);
  if (scan_fd < 0) return false;
  DIR* directory = fdopendir(scan_fd);
  if (directory == nullptr) {
    (void)close(scan_fd);
    return false;
  }
  std::array<bool, 4> seen = {false, false, false, false};
  bool valid = true;
  errno = 0;
  while (valid) {
    const struct dirent* entry = readdir(directory);
    if (entry == nullptr) {
      if (errno != 0) valid = false;
      break;
    }
    const std::string name(entry->d_name);
    if (name == "." || name == "..") continue;
    bool found = false;
    for (size_t index = 0; index < scaffold.size(); ++index) {
      if (name == scaffold[index].path) {
        if (seen[index]) valid = false;
        seen[index] = true;
        found = true;
        break;
      }
    }
    if (!found) valid = false;
  }
  if (closedir(directory) != 0) valid = false;
  if (!valid) return false;
  for (bool value : seen) {
    if (!value) return false;
  }

  for (const ScaffoldFile& file : scaffold) {
    struct stat named;
    if (fstatat(plugin_fd, file.path.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
        !S_ISREG(named.st_mode) || !ExactMode(named, 0644) ||
        named.st_uid != geteuid() ||
        named.st_size != static_cast<off_t>(file.contents.size())) {
      return false;
    }
    const int file_fd = openat(plugin_fd, file.path.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (file_fd < 0) return false;
    Fd descriptor(file_fd);
    struct stat opened;
    const bool matches = fstat(descriptor.Get(), &opened) == 0 && S_ISREG(opened.st_mode) &&
        SameIdentity(IdentityFrom(named), opened) && opened.st_uid == geteuid() && ReadExact(
            descriptor.Get(),
            file.contents.data(),
            file.contents.size());
    const bool closed = CloseChecked(&descriptor);
    if (!matches || !closed) return false;
  }
  return true;
}

bool HasCompletePlugin(int root_fd, const Input& input) {
  struct stat named;
  if (fstatat(root_fd, input.plugin_id.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
      !S_ISDIR(named.st_mode) || !ExactMode(named, 0700) || named.st_uid != geteuid()) {
    return false;
  }
  const int plugin_fd = openat(
      root_fd,
      input.plugin_id.c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (plugin_fd < 0) return false;
  Fd plugin(plugin_fd);
  struct stat opened;
  const bool matches = fstat(plugin.Get(), &opened) == 0 && S_ISDIR(opened.st_mode) &&
      SameIdentity(IdentityFrom(named), opened) && opened.st_uid == geteuid() &&
      HasExactScaffold(plugin.Get(), input.scaffold);
  const bool closed = CloseChecked(&plugin);
  return matches && closed;
}

void PauseBeforePublicationForTest() {
#if defined(PRISM_AUTHORING_TEST_PAUSE_BEFORE_PUBLICATION)
  const char ready = 'R';
  ssize_t written;
  do {
    written = write(3, &ready, 1);
  } while (written < 0 && errno == EINTR);
  if (written != 1) Fail(FailureCode::kCreateFailed);

  char resume = '\0';
  ssize_t received;
  do {
    received = read(4, &resume, 1);
  } while (received < 0 && errno == EINTR);
  if (received != 1 || resume != 'C') Fail(FailureCode::kCreateFailed);
#endif
}

FailureCode ClassifyAbsentRootCollision(const RootParent& parent, const Input& input) {
  if (!ParentPathMatches(parent)) return FailureCode::kRootChanged;
  const int parent_fd = parent.DirectoryFd();
  struct stat named;
  if (fstatat(parent_fd, parent.root_name.c_str(), &named, AT_SYMLINK_NOFOLLOW) != 0 ||
      S_ISLNK(named.st_mode) || !S_ISDIR(named.st_mode)) {
    return FailureCode::kRootChanged;
  }
  const int root_fd = openat(
      parent_fd,
      parent.root_name.c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (root_fd < 0) return FailureCode::kRootChanged;
  Fd root(root_fd);
  struct stat opened;
  if (fstat(root.Get(), &opened) != 0 || !S_ISDIR(opened.st_mode) ||
      !SameIdentity(IdentityFrom(named), opened)) {
    (void)CloseChecked(&root);
    return FailureCode::kRootChanged;
  }

  FailureCode result = FailureCode::kRootChanged;
  try {
    const Identity identity = IdentityFrom(opened);
    ValidateManagedRoot(root.Get(), identity, true);
    if (flock(root.Get(), LOCK_EX | LOCK_NB) != 0) {
      if (errno == EACCES || errno == EAGAIN || errno == EWOULDBLOCK) {
        result = FailureCode::kRootBusy;
      }
    } else {
      ValidateManagedRoot(root.Get(), identity);
      RequireNamedIdentity(
          parent_fd,
          parent.root_name.c_str(),
          identity,
          FailureCode::kRootChanged);
      if (HasCompletePlugin(root.Get(), input)) result = FailureCode::kDestinationExists;
    }
  } catch (const Failure& error) {
    if (error.value == FailureCode::kRootBusy) result = FailureCode::kRootBusy;
  } catch (...) {
    result = FailureCode::kRootChanged;
  }
  if (!ParentPathMatches(parent)) result = FailureCode::kRootChanged;
  if (!CloseChecked(&root)) return FailureCode::kCleanupFailed;
  return result;
}

void CompleteAbsentRoot(RootParent& parent, const Input& input) {
  Stage stage;
  bool stage_active = false;
  try {
    const int parent_fd = parent.DirectoryFd();
    stage = CreateStage(parent_fd);
    stage_active = true;
    WriteMarker(&stage);
    CreatePluginDirectory(&stage, input.plugin_id);
    WriteScaffold(
        stage.plugin_directory.directory.Get(),
        &stage.plugin_directory.entries,
        input.scaffold);
    if (!ParentPathMatches(parent) || !StageMatches(stage) || !NestedDirectoryMatches(stage)) {
      Fail(FailureCode::kRootChanged);
    }
    if (!FinalizeStage(&stage, false)) Fail(FailureCode::kCleanupFailed);
    PauseBeforePublicationForTest();
    if (!ParentPathMatches(parent) || !StageMatches(stage)) Fail(FailureCode::kRootChanged);

    const RenameResult renamed = RenameNoReplace(
        parent_fd,
        stage.name.c_str(),
        parent_fd,
        parent.root_name.c_str());
    if (renamed == RenameResult::kExists) Fail(ClassifyAbsentRootCollision(parent, input));
    if (renamed != RenameResult::kSuccess) Fail(FailureCode::kCreateFailed);
    stage.published = true;
    RequireNamedIdentity(
        parent_fd,
        parent.root_name.c_str(),
        stage.identity,
        FailureCode::kRootChanged);
    ValidateManagedRoot(stage.directory.Get(), stage.identity);
    if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
    if (!SyncAndClose(&stage.directory)) Fail(FailureCode::kCleanupFailed);
    if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
    if (!CloseRootParent(&parent, true)) Fail(FailureCode::kCleanupFailed);
  } catch (const Failure& error) {
    if (stage_active && !stage.published && !CleanupStage(&stage)) {
      Fail(FailureCode::kCleanupFailed);
    }
    throw error;
  } catch (...) {
    if (stage_active && !stage.published && !CleanupStage(&stage)) {
      Fail(FailureCode::kCleanupFailed);
    }
    Fail(FailureCode::kCreateFailed);
  }
}

void CompleteExistingRoot(RootParent& parent, Fd root, const Identity& root_identity, const Input& input) {
  Stage stage;
  bool stage_active = false;
  try {
    ValidateManagedRoot(root.Get(), root_identity, true);
    if (flock(root.Get(), LOCK_EX | LOCK_NB) != 0) {
      if (errno == EACCES || errno == EAGAIN || errno == EWOULDBLOCK) {
        Fail(FailureCode::kRootBusy);
      }
      Fail(FailureCode::kCreateFailed);
    }
    ValidateManagedRoot(root.Get(), root_identity);
    if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
    RequireNamedIdentity(
        parent.DirectoryFd(),
        parent.root_name.c_str(),
        root_identity,
        FailureCode::kRootChanged);

    stage = CreateStage(root.Get());
    stage_active = true;
    WriteScaffold(stage.directory.Get(), &stage.entries, input.scaffold);
    if (!FinalizeStage(&stage, true)) Fail(FailureCode::kCleanupFailed);
    PauseBeforePublicationForTest();
    ValidateManagedRoot(root.Get(), root_identity);
    if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
    RequireNamedIdentity(
        parent.DirectoryFd(),
        parent.root_name.c_str(),
        root_identity,
        FailureCode::kRootChanged);
    if (!StageMatches(stage)) Fail(FailureCode::kRootChanged);

    const RenameResult renamed = RenameNoReplace(
        root.Get(),
        stage.name.c_str(),
        root.Get(),
        input.plugin_id.c_str());
    if (renamed == RenameResult::kExists) Fail(FailureCode::kDestinationExists);
    if (renamed != RenameResult::kSuccess) Fail(FailureCode::kCreateFailed);
    stage.published = true;
    ValidateManagedRoot(root.Get(), root_identity);
    if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
    RequireNamedIdentity(
        parent.DirectoryFd(),
        parent.root_name.c_str(),
        root_identity,
        FailureCode::kRootChanged);
    if (!SyncAndClose(&root)) Fail(FailureCode::kCleanupFailed);
    if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
    RequireNamedIdentity(
        parent.DirectoryFd(),
        parent.root_name.c_str(),
        root_identity,
        FailureCode::kRootChanged);
    if (!CloseRootParent(&parent, false)) Fail(FailureCode::kCleanupFailed);
  } catch (const Failure& error) {
    if (stage_active && !stage.published && !CleanupStage(&stage)) {
      Fail(FailureCode::kCleanupFailed);
    }
    throw error;
  } catch (...) {
    if (stage_active && !stage.published && !CleanupStage(&stage)) {
      Fail(FailureCode::kCleanupFailed);
    }
    Fail(FailureCode::kCreateFailed);
  }
}

void CreateManagedPlugin(const Input& input) {
  RootParent parent = OpenRootParent(input.root_components);
  if (!ParentPathMatches(parent)) Fail(FailureCode::kRootChanged);
  const int parent_fd = parent.DirectoryFd();
  struct stat named_root;
  if (fstatat(
          parent_fd,
          parent.root_name.c_str(),
          &named_root,
          AT_SYMLINK_NOFOLLOW) != 0) {
    if (errno == ENOENT) {
      CompleteAbsentRoot(parent, input);
      return;
    }
    Fail(FailureCode::kCreateFailed);
  }

  if (S_ISLNK(named_root.st_mode)) Fail(FailureCode::kRootParentSymlink);
  if (!S_ISDIR(named_root.st_mode)) Fail(FailureCode::kRootUnmanaged);
  const int root_fd = openat(
      parent_fd,
      parent.root_name.c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (root_fd < 0) {
    if (errno == ELOOP) Fail(FailureCode::kRootParentSymlink);
    if (errno == ENOTDIR) Fail(FailureCode::kRootUnmanaged);
    Fail(FailureCode::kCreateFailed);
  }
  Fd root(root_fd);
  struct stat opened_root;
  ReadStat(root.Get(), &opened_root);
  if (!S_ISDIR(opened_root.st_mode)) Fail(FailureCode::kRootUnmanaged);
  if (!SameIdentity(IdentityFrom(named_root), opened_root)) Fail(FailureCode::kRootChanged);
  CompleteExistingRoot(parent, std::move(root), IdentityFrom(opened_root), input);
}

void ThrowFailure(napi_env env, FailureCode code) {
  napi_value message;
  napi_value error;
  RequireNapi(env, napi_create_string_utf8(env, FailureName(code), NAPI_AUTO_LENGTH, &message));
  RequireNapi(env, napi_create_error(env, nullptr, message, &error));
  RequireNapi(env, napi_set_named_property(env, error, "code", message));
  (void)napi_throw(env, error);
}

napi_value CreateManagedPluginCallback(napi_env env, napi_callback_info info) {
  try {
    const Input input = ParseInput(env, info);
    CreateManagedPlugin(input);
    napi_value result;
    RequireNapi(env, napi_get_undefined(env, &result));
    return result;
  } catch (const Failure& error) {
    ThrowFailure(env, error.value);
  } catch (...) {
    ThrowFailure(env, FailureCode::kCreateFailed);
  }
  return nullptr;
}

napi_value Initialize(napi_env env, napi_value exports) {
  napi_property_descriptor descriptor = {
      "createManagedPlugin",
      nullptr,
      CreateManagedPluginCallback,
      nullptr,
      nullptr,
      nullptr,
      static_cast<napi_property_attributes>(
          napi_writable | napi_enumerable | napi_configurable),
      nullptr,
  };
  if (napi_define_properties(env, exports, 1, &descriptor) != napi_ok) return nullptr;
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
