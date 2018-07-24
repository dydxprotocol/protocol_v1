#!/bin/bash

cleanup ()
{
  kill -s SIGTERM $!
  exit 0
}

trap cleanup SIGINT SIGTERM

npm run node -- -i 1212 -d -p 8545 -h 0.0.0.0 &
sleep 5
npm run migrate -- --network=docker --reset

while [ 1 ]
do
  sleep 60 &
  wait $!
done
