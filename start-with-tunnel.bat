@echo off
title Fikra Academy Server + Public Tunnel
color 0E

echo =======================================================
echo         FIKRA ACADEMY SERVER & PUBLIC TUNNEL
echo =======================================================
echo.

:: 1. Check if Node.js modules are installed
if not exist node_modules (
    echo [Fikra] Node modules not found. Installing dependencies...
    call npm install
)

:: 2. Start the local signaling server in the background
echo [Fikra] Starting signaling server on port 3001...
start /B node server/index.js

:: 3. Give the server 2 seconds to bind to port 3001
timeout /t 2 /nobreak > nul

:: 4. Start localtunnel to expose port 3001 publicly
echo [Fikra] Exposing server port 3001 to the internet...
echo [Fikra] Share the URL below with your students.
echo -------------------------------------------------------
call npx localtunnel --port 3001
echo.
echo [Fikra] Server or tunnel stopped.
pause
