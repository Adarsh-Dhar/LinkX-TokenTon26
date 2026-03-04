#!/bin/bash
# Launch all 48 provider microservices in the background

for cat in {0..23}
do
  for comp in 0 1
  do
    echo "Starting provider for category $cat, competitor $comp..."
    node provider.js $cat $comp &
  done
done

echo "All provider microservices launched."
