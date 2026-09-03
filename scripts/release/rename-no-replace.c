#define _GNU_SOURCE

#include <errno.h>
#include <stdio.h>

#if defined(__APPLE__)
#include <sys/stdio.h>
#elif defined(__linux__)
#include <fcntl.h>
#include <sys/syscall.h>
#include <unistd.h>
#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE 1
#endif
#else
#error "atomic no-replace rename is unsupported on this platform"
#endif

int main(int argc, char **argv) {
  if (argc != 3) return 2;

#if defined(__APPLE__)
  const int result = renamex_np(argv[1], argv[2], RENAME_EXCL);
#else
  const long result = syscall(
    SYS_renameat2,
    AT_FDCWD,
    argv[1],
    AT_FDCWD,
    argv[2],
    RENAME_NOREPLACE
  );
#endif

  if (result == 0) return 0;
  if (errno == EEXIST || errno == ENOTEMPTY) return 3;
  return 4;
}
