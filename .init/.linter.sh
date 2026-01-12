#!/bin/bash
cd /home/kavia/workspace/code-generation/fruit-ninja-online-web-game-228646-228685/GameFrontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

