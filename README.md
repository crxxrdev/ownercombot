# ownercombot

A Discord moderation bot with a web dashboard for toggling the bot and filtering on/off.

## Features

- Deletes toxic messages containing censored profanity or blocked words.
- Deletes messages with attachments or image links.
- Includes a web dashboard at `/` with toggles for bot and filter state.
- Stores settings in `settings.json`.

## Setup

1. Copy `.env.example` to `.env`.
2. Add your Discord bot token to `.env`.
3. Install dependencies:

   npm install

4. Start the application:

   npm start

5. Open the dashboard:

   http://localhost:3000

## Configuration

- `DISCORD_TOKEN` is required.
- `PORT` is optional. Defaults to `3000`.

## Deployment

### Local deployment

Run `npm start` to host both the website and the bot together.

### Vercel deployment

This project includes a deployable dashboard in `public/`. Vercel can serve the website, but Discord bots require a long-running process, so the actual bot connection should run on a host that supports persistent Node.js processes.

If you want to deploy the website to Vercel:

1. Add this repository to Vercel.
2. Use the default static deployment settings.
3. Set `DISCORD_TOKEN` in Vercel environment variables if you later add a backend host.

## How it works

- `index.js` starts an Express website and starts the Discord bot.
- `bot.js` connects the Discord bot and deletes messages when enabled.
- `settings.js` saves and loads `botEnabled` and `filterEnabled`.
- The dashboard page allows toggling the bot and filter state.

## Customize

- Add more banned words in `bot.js` inside the `blockedWords` array.
- Add more image extensions in `bot.js` inside the `imageExtensions` array.
