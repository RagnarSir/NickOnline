<!-- Generated from src/help/guide.json by tools/build_howto.py — do not edit by hand. -->

# How to use NickOnline

NickOnline works out what a Hattrick match is likely to do. You enter both teams' ratings, set pieces, tactic and specialties; it gives you the odds, the expected goals and the most likely scoreline. The model is nickarana's Simulator v5.1, reproduced exactly — same numbers as the spreadsheet, to fifteen decimal places. Nothing is random: the same input always gives the same answer.

## Contents

- [Quick start](#quick-start)
- [Importing from Hattrick](#importing-from-hattrick)
- [Entering a match](#entering-a-match)
- [The pitch](#the-pitch)
- [Set pieces, tactic and specialties](#set-pieces-tactic-and-specialties)
- [Reading the result](#reading-the-result)
- [Comparing lineups](#comparing-lineups)
- [Saving and sharing](#saving-and-sharing)
- [Model corrections](#model-corrections)
- [When the numbers look wrong](#when-the-numbers-look-wrong)

## Quick start

1. Click **Load example** to fill in a complete matchup, so you can see what a finished entry looks like.
2. Rename the two teams by clicking their names in the scoreboard at the top.
3. Type your own ratings into the pitch, then set each side's tactic and specialties below it.
4. Read the result. The scoreboard follows you as you scroll, so you can change a tactic and watch the odds move.

> Nothing you enter leaves your browser, and nothing is saved until you press **Save**.

## Importing from Hattrick

Rather than typing your team in, paste it. Hattrick will give you the whole lineup as text, and **Import from Hattrick** in the toolbar reads it.

1. In Hattrick, use the copy buttons on your lineup page. There are **two** copies: one for the ratings, one for the lineup and specialties.
2. Click **Import from Hattrick** here and paste. Either copy works on its own, and you can paste both together in any order.
3. Check the review. It shows every value under this app's own labels, and the specialty grid exactly as it will land.
4. Click **Apply** to fill in Team A.

> Hattrick lists sectors right to left; this app lists them left to right. The import flips them for you — which is why the review shows `Attack L` rather than echoing the paste order. If a wing looks like it landed on the wrong side, that's the place you'd see it.

Everything the paste contains is imported: the seven ratings, the tactic and its level, and every player's specialty. `Powerful` becomes the powerful-forward or powerful-inner-midfield code depending on where that player is playing.

> Set-piece ratings and keeper stars are not in either copy, so the import leaves yours alone and highlights those three fields afterwards. Fill them in and the highlight clears.

Imports always fill **Team A**, on the assumption that the lineup you copied is your own. To model an opponent, enter them on the Team B side by hand.

## Entering a match

Two ways in, chosen with **Enter ratings as** above the pitch.

| Mode | Use it when |
|---|---|
| Match ratings | You have the ratings from a match report or a prediction — the normal case. |
| Sector percentages | You already know each sector's conversion rate and want to drive those directly. |

**Specialties: Entered** uses the specialty grids you fill in. **Estimated** skips them and approximates the special events instead — quicker, less accurate.

## The pitch

Ratings are laid out as the duels the model actually computes. Each attack sector sits directly above the defender it meets — and it is the *mirrored* one: your left attack faces their right defence. The pitch shows you which, so you can see at a glance where you are strong against where they are weak.

Under each box is the rating in Hattrick's own words, so `12.5` reads as `magnificent (high)`. The bar next to it gives you the rough strength at a glance.

Midfield sits between the two halves. In **Match ratings** mode the possession split is computed from the two midfield ratings — it is cubic, so a small edge compounds into a large share. In **Sector percentages** mode you set possession yourself with the slider.

> In Sector percentages mode the attack and defence ratings are still used — for the HTS score and the counter-attack model. They are behind **Attack & defence ratings** in each team's panel.

## Set pieces, tactic and specialties

- **Set pieces & keeper** — your set-piece defence and attack ratings, and the keeper's star rating. Keeper stars must be one of the listed values; the model looks them up exactly rather than interpolating.
- **Tactic** — the tactic and its skill level. Skill is disabled for *(no tactic)*, which has none.
- **Specialties** — one row per line (forwards, midfield, defence, keeper) and five positions across. Hatched slots are positions that line does not use.
- **Ground** — home, away, derby or neutral. This only adjusts the neutral HTS figure. It does **not** change the odds.

> `Z` means a player with no specialty, which is not the same as an empty slot. An empty slot means nobody is there — leave a winger blank and the model stops generating winger events for you.

## Reading the result

- **Scoreboard** — the single most likely scoreline, each side's expected goals, and the win/draw/loss bar. It stays pinned to the top while you edit.
- **Result** — the same odds after 90 minutes, after extra time, and after penalties.
- **Key numbers** — expected goals, expected points, HTS, neutral HTS and total chances for both sides.
- **Goal distribution** — how likely each side is to score exactly 0, 1, 2… goals.
- **Scoreline probabilities** — the chance of every individual scoreline, darkest where it is most likely.
- **Where the goals come from** — chances and expected goals split by source, with the full per-sector and per-event detail behind the disclosures.

> The penalties row may show a hatched **Unresolved** band. That is a genuine defect in v5.1, left visible rather than hidden — see Model corrections below.

## Comparing lineups

To find the setup that stands up best against whatever the opponent fields, use the **Lineup library**.

1. Set up one side the way you want it, then click **Save current setup** on that team's shelf and name it.
2. Change something — the tactic, a specialty, a rating — and save it again under a different name.
3. Do the same for the other side, saving each setup you think they might use.
4. Read the matrix below: every one of your setups played against every one of theirs.

Cells are your win probability. Blue means you are favoured, orange means they are, grey is a coin toss. An outlined cell is the best answer to that column. **Average** and **Worst case** rank your options across all of theirs — pick on worst case when you cannot predict what they will field. Click any cell to load that pairing.

**Saved matchups** is the other half: whole matchups rather than one side's setup, listed together and sortable by any column. Use it for one-off what-ifs. The `±` button pins one as a baseline, and the Key numbers tiles then show deltas against it.

## Saving and sharing

- **Copy link** puts the entire matchup into the URL and copies it. Anyone who opens that link sees exactly what you see. Nothing is stored on a server — the whole matchup travels in the link.
- **Save** keeps a matchup in this browser. **Save current setup** does the same for one side's lineup.
- **Start over** clears everything back to a blank matchup.

> Saved matchups and lineups live in this browser only. They do not follow you to another device, and clearing site data removes them. Use **Copy link** for anything you want to keep or send on.

## Model corrections

Porting the spreadsheet turned up four genuine defects in v5.1. They ship **switched off**, so the numbers match the spreadsheet exactly. Turn any of them on in the **Model corrections** panel to see what changes.

| Correction | What it fixes |
|---|---|
| After penalties | The penalty row reads two empty cells, so it silently repeats the 90-minute figures and never uses the shootout odds it already worked out. |
| Team B's counter-attacks | Team A gains counter-attacks from the opponent's missed Unpredictable events; Team B's formula leaves that term out. |
| Team B's HTS attack weights | Team B's attack is built using Team A's tactic weights, so changing your tactic moves their HTS. Affects the HTS figure only, never the odds. |
| Attack in Middle weight | The centre slot takes the side weight, so the weights sum to 0.75 instead of 1. Affects the HTS figure only. |

A fifth switch, **Percent mode: linearise counter-attacks**, is an improvement rather than a fix: v5.1 already derives possession from your entered percentage for corners, and this extends the same treatment to the counter-attack model.

## When the numbers look wrong

- **A red banner appears.** The matchup cannot be evaluated as entered. The message names the field — usually a keeper star rating that is not on the allowed list, or a defensive line with fewer than two or more than five players.
- **Winger events are zero.** Check the winger slots in the midfield row are not empty. Put `Z` there if the player has no specialty.
- **A Quick, Head or Unpredictable row shows nothing.** Open **Special events** under "Where the goals come from" and check that side's count for the row. A count of zero means nobody in the right position carries that specialty — for Quick events that means the forwards and midfield.
- **Home advantage changes nothing.** Correct. Ground only moves the neutral HTS figure — the odds never depend on it.
- **Percent mode ignores a rating change.** Sector percentages replace the ratings for chance conversion, but HTS and counter-attacks still read them.

---

*Model and lookup tables by nickarana — Simulator v5.1, last revised 26 October 2025.*
