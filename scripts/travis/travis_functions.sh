# As advised by https://twitter.com/plexus/status/499194992632811520?lang=en
# Based on https://github.com/travis-ci/travis-build/blob/20903aad38a9db0717827275b70c8a2c53820f85/lib/travis/build/templates/header.sh

# MIT LICENSE
#
# Copyright (c) 2016 Travis CI GmbH <contact@travis-ci.org>
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

ANSI_RED="\033[31;1m"
ANSI_GREEN="\033[32;1m"
ANSI_RESET="\033[0m"

travis_retry() {
  local result=0
  local count=1
  while [ $count -le 3 ]; do
    [ $result -ne 0 ] && {
      echo -e "\n${ANSI_RED}The command \"$@\" failed. Retrying, $count of 3.${ANSI_RESET}\n" >&2
    }
    "$@" && { result=0 && break; } || result=$?
    count=$(($count + 1))
    sleep 1
  done
  [ $count -gt 3 ] && {
    echo -e "\n${ANSI_RED}The command \"$@\" failed 3 times.${ANSI_RESET}\n" >&2
  }
  return $result
}

travis_jigger() {
  local cmd_pid=$1
  shift
  local timeout=$1
  shift
  local count=0
  echo -e "\n"
  while [ $count -lt $timeout ]; do
    count=$(($count + 1))
    echo -ne "Still running ($count of $timeout): $@\r"
    sleep 60
  done
  echo -e "\n${ANSI_RED}Timeout (${timeout} minutes) reached. Terminating \"$@\"${ANSI_RESET}\n"
  kill -9 $cmd_pid
}

travis_wait() {
  local timeout=$1
  if [[ $timeout =~ ^[0-9]+$ ]]; then
    shift
  else
    timeout=20
  fi
  local cmd="$@"
  local log_file=travis_wait_$$.log
  $cmd &>$log_file &
  local cmd_pid=$!
  travis_jigger $! $timeout $cmd &
  local jigger_pid=$!
  local result
  {
    wait $cmd_pid 2>/dev/null
    result=$?
    ps -p$jigger_pid &>/dev/null && kill $jigger_pid
  }
  if [ $result -eq 0 ]; then
    echo -e "\n${ANSI_GREEN}The command $cmd exited with $result.${ANSI_RESET}"
  else
    echo -e "\n${ANSI_RED}The command $cmd exited with $result.${ANSI_RESET}"
  fi
  echo -e "\n${ANSI_GREEN}Log:${ANSI_RESET}\n"
  cat $log_file
  return $result
}
