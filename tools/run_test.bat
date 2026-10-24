@echo off
node tools/test.cjs rules
exit /b %errorlevel%
