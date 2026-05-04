# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Shell Usage

Always source `~/.zshrc` before running commands.

## Code Style and Documentation

We value code that explains itself through clear class, method, and variable names. Comments may be used when necessary to explain tricky logic, but should otherwise be avoided. Write self-documenting code with descriptive names rather than relying on comments.

Use unitary commits with concise and comprehensive commit messages to make the review easier.

Never use unicode characters such as long dashes, triple dots, arrows or emojis, in the code or in the doc.

## Project Overview

Crimpy is a climbing training platform composed of a flutter app that connects to a BLE force sensor, a Golang backend and a coach web portal. This project is the frontend for the coaching part of the app, which will allow a coach to invite trainees, manage their plannings, see their sessions, give feedback, etc.

## Design

The design guidelines should align with the Crimpy flutter app, which theme is available at /home/krakoer/Documents/code/crimpy/crimpy-app/lib/theme/crimpy_theme.dart.

## API

The API swagger is available at https://api.crimpy.app/swagger/doc.json
