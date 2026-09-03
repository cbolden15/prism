.PHONY: dev build test pack

dev:
	npm run --silent prism:demo -- 'Count the words in: one two three'

build:
	npm run typecheck

test:
	npm test

pack:
	npm run pack:check
