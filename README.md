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

### Railway deployment

Railway works well for Node.js apps and can host the bot process.

1. Add this repository to Railway.
2. Set `DISCORD_TOKEN` in Railway Environment Variables.
3. Set the `Start Command` to `npm start` if Railway does not auto-detect it.
4. Deploy the project.

Railway will use `PORT` from the environment when starting your app.

## How it works

- `index.js` starts an Express website and starts the Discord bot.
- `bot.js` connects the Discord bot and deletes messages when enabled.
- `settings.js` saves and loads `botEnabled` and `filterEnabled`.
- The dashboard page allows toggling the bot and filter state.

## Customize

- Add more banned words in `bot.js` inside the `blockedWords` array.
- Add more image extensions in `bot.js` inside the `imageExtensions` array.
