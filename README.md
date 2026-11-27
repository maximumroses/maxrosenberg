# Krillion Unlimited

An unlimited-play clone of Krillion: answer prompts with things few other players would say. Rarer answer = more points (max 100 per prompt, 700 per game).

## Run
    python3 -m http.server -d site 8000   # then open http://localhost:8000

## Regenerate games
    python3 tools/generate.py

Writes `site/data/categories.json` and `site/data/games.json` (1,000 deterministic games × 7 prompts).
Add content in `tools/categories.py` (items ordered most-common-first; that order drives simulated popularity).

## Notes
- Popularity is simulated (Zipf over each category's ranked list). A real backend aggregating player answers would replace `buildPrompt` shares.
- Answers not on a list but satisfying the prompt's constraint score 100 ("one in a krillion"); they aren't verified as real words.
