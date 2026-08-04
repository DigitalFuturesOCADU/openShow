# Running a show

Everything needed to put on an Open Show, in order. Written for whoever is
running it, not for whoever built it.

You need [Node.js](https://nodejs.org) installed, and this repository checked
out. Once, before anything else:

```bash
npm install
```

---

## The easy way: the console

Everything below can be done from a window rather than a terminal:

```bash
npm start
```

That opens a control panel at <http://localhost:4322> with the same five stages
as buttons and forms — announce a show, bring in submissions, review, build. It
shows every show with its date, how many works are live and how many are waiting
for review, and prints what each step is doing as it runs.

You still type that one command to start it. Everything after that is clicking.

The panel is only reachable from your own machine — it is not a website and
cannot be opened by anyone else, even on the same network.

**The spreadsheet** is chosen with "Choose a file…" and copied into place for
you. **The image folder** is chosen by browsing to it — the console walks your
folders because a web page cannot be handed a real folder path, and it remembers
the choice. Spreadsheets are never committed to the repository, because they
contain student email addresses.

**Stage 4 tells you what needs running.** Each step says whether it is up to date
or needed, so you are not guessing which buttons to press or in what order.

The rest of this document explains what each stage does, and gives the terminal
equivalent if you prefer it or something goes wrong.

---

## The shape of it

| Stage | When | What happens |
| --- | --- | --- |
| **1. Announce** | Months ahead | The show page goes up with date, time and place. No work yet. |
| **2. Collect** | Call for submissions | Students submit through the Microsoft Form as usual. |
| **3. Ingest** | As they arrive | The spreadsheet and image folder become project pages, unpublished. |
| **4. Review** | Before opening | You look at each one and mark it ready. It goes live. |
| **5. Publish** | Whenever | Rebuild and upload. |

Two things gate whether work is public, and both start out permissive:

- **A project is `draft` until you review it.** Ingest never publishes anything
  on its own.
- **A show is `open` unless you say otherwise.** So reviewed work appears
  straight away, which is usually what you want — the work is the best
  advertisement the show has.

---

## Stage 1 — Announce the show

Do this as early as you like. The page can be up for months with nothing on it
but the date.

```bash
npm run publish -- --show 2026 --create \
  --date  2026-12-09 \
  --time  "5:00 – 8:00 pm" \
  --venue "205 Richmond Street West" \
  --rooms "Graduate Gallery, X Fab Space"
```

Then rebuild and look:

```bash
npm run extract
npm run dev
```

Open <http://localhost:4321/shows/2026>. You should see the date, time, location
and rooms, and "Work goes online when the show opens."

`--rooms` is optional; leave it off until the rooms are booked. Everything can be
changed later by editing `config/overrides.yaml` — find `show:2026:` and edit the
lines beneath it.

**Changing the date later:** edit `config/overrides.yaml`, then `npm run extract`.

The new show automatically becomes the current one, which is what the front page
leads with. The previous show moves into the archive by itself.

---

## Stage 2 — Collect submissions

Nothing to do here. Students fill in the Microsoft Form; responses land in the
usual spreadsheet and the uploads in the usual SharePoint folder.

One thing worth doing **before** the call goes out: read
[INTAKE-FORM.md](INTAKE-FORM.md). It lists changes to the form that save work
later — chiefly asking which image should lead, and asking for a one-line
description of each image so the site is usable by people with screen readers.
Neither can be added afterwards.

---

## Stage 3 — Ingest the submissions

Download the response spreadsheet, and make sure the SharePoint folder is synced
to your machine so it is a normal folder you can point at.

Always look before you write:

```bash
npm run ingest -- \
  --sheet "Digital Futures 2026 OPEN Show Submissions.xlsx" \
  --show 2026 \
  --media ~/OneDrive/DF_OPEN_SHOW/Submissions \
  --dry-run
```

It reports what it would create, what it would skip, and anything odd —
submissions with no images, links pasted instead of files uploaded, someone who
answered "No" to the consent question. Read that list. Then run it for real by
removing `--dry-run`:

```bash
npm run ingest -- --sheet "…xlsx" --show 2026 --media ~/OneDrive/… 
npm run media          # turn the photos into web-sized versions
npm run extract        # assemble the site content
npm run dev            # look at it
```

Everything arrives as **draft**. Nothing is public yet.

**Running it twice is safe.** Work already brought in is compared and reported,
never overwritten — so a correction you made last week survives.

### If no images are found

If it says *"NONE of the N referenced files matched"*, the names in the
spreadsheet and the names on disk disagree — usually because the sync client
renamed them. Compare one filename in the sheet against one in the folder and
see [OPEN-ITEMS.md](OPEN-ITEMS.md) §1.1. This has not been tested against a real
synced folder yet, so it is the most likely thing to need attention the first
time.

---

## Stage 4 — Review and go live

Look through the drafts locally with `npm run dev`. When they are right:

```bash
npm run publish -- --show 2026 --review
npm run extract
npm run dev
```

They are now live on the site. That is the normal path.

### Holding work back until opening night

Only if you want the page up but the work hidden. Add to `config/overrides.yaml`
under `show:2026:`:

```yaml
  visibility: announced
```

Reviewed work then stays invisible and the page says how many pieces are ready.
On the night:

```bash
npm run publish -- --show 2026 --open
npm run extract
```

Everything appears at once.

---

## Stage 5 — Publish the site

```bash
npm run build
```

This produces the finished site in `dist/`. Upload that folder, or push to the
repository if the host builds automatically.

Before uploading it is worth running:

```bash
npm test          # checks every page has a working address
npm run links     # checks external links, marks dead ones so they stop showing
```

---

## Fixing things

Almost everything is corrected in **`config/overrides.yaml`**, keyed by the
project's `id` — you will find it at the top of the project's file in
`content/projects/`. Corrections there survive re-running anything.

```yaml
2699:
  title: "The Correct Title"
  medium: [installation, sound]
```

Then `npm run extract`.

**Do not edit files in `content/` by hand.** They are rebuilt every time and your
change will disappear. `config/` is where edits live.

| Thing to fix | Where |
| --- | --- |
| Wrong title, medium, year, affiliation | `config/overrides.yaml`, by project id |
| Someone's name spelled two ways | `config/people.yaml`, under `aliases:` |
| A medium that should be renamed or merged | `config/taxonomy-map.yaml` |
| Show date, venue, rooms | `config/overrides.yaml`, under `show:<year>:` |
| A form question was reworded | `config/form-map.yaml` |

---

## What each command does

| Command | Does |
| --- | --- |
| `npm run publish` | Declares a show, marks work reviewed, or opens a held-back show |
| `npm run ingest` | Reads the submission spreadsheet into project files |
| `npm run media` | Makes web-sized images from the originals |
| `npm run extract` | Assembles everything into the site's content |
| `npm run dev` | Serves the site locally so you can look at it |
| `npm run build` | Produces the finished site in `dist/` |
| `npm test` | Checks every page has a working address |
| `npm run links` | Checks external links and marks dead ones |

`npm run extract` is safe to run at any time and as often as you like. It rebuilds
everything from the originals plus your corrections, so it cannot lose work.

---

## After the show

Nothing. The next show declared with `--create` becomes the current one, and this
one moves into the archive on its own, keeping its own page, its works and its
list of exhibitors.
