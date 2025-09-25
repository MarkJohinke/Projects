#!/bin/sh

if command -v winpty >/dev/null 2>&1; then
  if test -t 1; then
    exec < /dev/tty
  fi
fi

