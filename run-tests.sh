#!/bin/bash
cd /Users/hafizsuara/Projects/v0fastform
pnpm install
pnpm test lib/deploy/github-repo.test.ts
