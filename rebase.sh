#!/bin/bash
sed -i 's/^pick \(.* feat: add fulfillment.*\)/edit \1/' "$1"
