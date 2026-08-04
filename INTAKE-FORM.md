# Intake form — changes for 2026

Notes for whoever edits the Microsoft Form before the next call for submissions.

Everything here comes from analysing the real 2025 responses
(`Digital Futures 2025 OPEN Show Submissions.xlsx`, 40 rows) against the
migrated archive. Counts are actual.

The form is now the CMS. `scripts/ingest.mjs` reads its response sheet directly
into the site content, so a question that isn't asked is data that doesn't
exist — and, as 2025 showed, may be unrecoverable later.

---

## Why this matters more than it looks

The 2025 show recorded **no affiliation at all** in WordPress — 0 of 38
projects. It was only recoverable because the form had asked the question and
the answer sat unread in the spreadsheet for a year. That single question is
what took 2025 from 0/38 to 37/38.

Everything below is the same bet: ask at submission, or reconstruct it by hand
later, or lose it.

---

## 1. Add these questions

### 1a. Which image is the main one? — **highest value**

**Problem.** 34 of 38 submissions arrive with no indication of which image
should lead. Someone on staff currently works this out and renames the file
with a `_FEATURE` suffix by hand — 10 archived projects show the marks of it.

None of the 134 files students actually uploaded carry that marker. It is
added afterwards, by staff, as manual work.

**Fix.** A required question listing the uploaded files, or simply:

> **Which image should be the main one?** Give the file name, or the number of
> the upload (1st, 2nd, …).

This deletes a manual step, and it's the submitter's call to make anyway.

### 1b. Alt text for each image — **the accessibility gap**

**Problem.** 704 archived images have no alt text. Only 14 of 850 WordPress
attachments had any, and those were placeholders like "Person Image". This
cannot be backfilled from anywhere — it has to be written by someone who saw
the work.

If this is an Ontario public-sector site, AODA/WCAG 2.0 AA likely applies as a
legal requirement rather than a nicety. Worth confirming with whoever owns web
compliance.

**Fix.** One short text field per upload:

> **Describe this image in one sentence, for someone using a screen reader.**
> Example: "A visitor reaches toward a glowing fabric panel suspended at head
> height."

The existing 704 can't be fixed this way, but every image from 2026 on arrives
correct, and the backlog stops growing.

### 1c. Image order (optional)

Currently order comes from upload order, which is probably fine. If order
matters to submitters, ask them to number their files `01_`, `02_` — ingest
already reads a numeric prefix.

### 1d. Affiliation **per person**, not per project — **fixes a real error**

**Problem.** Affiliation is currently recorded once for the whole project. On a
mixed team that loses who is what. `Bodies in Play Zine` has six people and the
affiliations `alumni, faculty, graduate` — but nothing says which of the six is
the faculty member.

This is not just imprecise, it produces wrong output. The participants list has
to put every member in every group their team held, so those six people
generate eighteen entries. Across the archive:

| | |
| --- | ---: |
| Projects with a mixed team of more than one person | 10 |
| People on them | 40 |
| Participant-list entries they currently generate | 90 |
| **Over-count** | **50 (125%)** |

Worst cases: `Bodies in Play Zine` 6 × 3 = 18 entries, `Textile Game
Controllers` 8 × 2 = 16, `Bodies in VR` 4 × 3 = 12.

Asking per person makes "participants in 2026, grouped by affiliation" exact
instead of an over-estimate. It also means project-level affiliation no longer
needs asking at all — it is simply the set of the team's answers, so there is
one fewer question, not one more.

**Fix — two options.**

*Option A: fixed optional slots (recommended).* Eight pairs of questions —
"Team member N: name" and "Team member N: connection to Digital Futures" —
with only the first pair required and the rest optional. No branching logic to
build or break, and Forms handles blanks fine. Add one overflow text field for
the rare huge team.

*Option B: a count question driving branching.* "How many people worked on
this?" then branch to a section with that many slots. Closer to what you
described and tidier for the submitter, but Microsoft Forms branches to whole
sections rather than individual questions, so it means maintaining several
near-duplicate sections. More to go wrong at the moment it matters.

**Sizing, from the archive:**

| Team size | Projects |
| --- | ---: |
| 1 | 166 |
| 2–4 | 73 |
| 5–8 | 19 |
| 9+ | 2 |

63% of projects are solo, so keep that path fast — one required slot, the rest
optional and visibly so. Eight slots covers all but two projects ever recorded
(`Alt Controllers: Round 2` with 11, `Drone Delivery` with 9), and an overflow
field catches those.

**Use the same five values as the current affiliation question:**
`DF Undergrad Student` · `DF Grad Student` · `DF Alumni` · `DF Faculty` ·
`UG Thesis`

**Until then**, the participant lists mark affected people with a dagger and
state the over-count in the report, rather than presenting inflated numbers as
fact.

---

## 2. Fix the drift already in the form

The form's own option lists contain duplicates. This is exactly the drift that
produced 189 terms for ~30 concepts in WordPress, appearing again inside a
single year.

### 2a. `sound` and `audio/sound` are both options

18 submissions split across two options meaning the same thing — 11 chose
`audio/sound`, 7 chose `sound`.

**Fix.** Delete one. Keep **`sound`**.

### 2b. `DF Faculty` and `Faculty` are both options

Two chose `DF Faculty`, one chose `Faculty`.

**Fix.** Delete one. Keep **`DF Faculty`**.

### 2c. The tag list has a free-text escape hatch

One 2025 submission entered:

> `playshop, futures thinking, games as ideation tools, design thinking`

into what should be a fixed list. Ingest routes unrecognised values to `tags`
rather than dropping them, so nothing is lost — but the medium vocabulary
stops being a vocabulary the moment it accepts prose.

**Fix.** Either remove the "Other" option, or relabel it clearly so it feeds
themes rather than medium:

> **Anything else that describes this work?** (free text — used for themes, not
> for the medium filter)

---

## 3. Make image upload actually be an upload

**Problem.** Three 2025 submissions pasted links instead of uploading:

- a Google Drive folder
- a Google Slides `edit?slide=…` URL
- a bare link

None can be ingested. All three will rot — a Drive folder shared today may be
gone or permission-locked in three years, which is precisely the failure this
project exists to prevent.

**Fix.** Set the question to file upload only, and say so in the help text:

> Upload the files themselves. Links to Drive, Dropbox or Slides can't be
> accepted — they stop working over time and the archive is meant to outlive
> them.

One submission arrived with no images at all. Worth making at least one
required.

---

## 4. Do not ask for the year

The show year is assigned by the organiser when ingest runs
(`--show 2026`), never by the submitter. Asking invites a wrong answer that
overrides a correct one.

Same for anything else the organiser controls: the show, the venue, the dates.

---

## 5. Keep these exactly as they are

They work, and one of them saved the 2025 data.

| Question | Why keep it |
| --- | --- |
| Connection(s) to Digital Futures | This is affiliation. It rescued 2025. Keep it required, keep it multi-select. |
| Tags that apply | Multi-select is right; just fix the duplicates above. |
| Team members | Free text is fine — the splitter handles commas, semicolons, "and", "&", and roles in parentheses. |
| Commitment / consent | Only record of permission to publish. See §6. |
| Additional wall card info | Medium, dimensions, materials — genuine curatorial data WordPress never captured. |
| Presentation, sound, light, screen, stage, course | Exhibition logistics, no equivalent in the archive. Ingest stores them all. |

---

## 6. Handle the consent answer properly

One 2025 submission (11 team members) answered **"No"** to the commitment
question and still appears in the archive.

**Fix, in the form.** Make the wording unambiguous about what is being agreed
to — publication on a public website, indefinitely — and make it required.

**Fix, in the process.** Ingest flags any non-"Yes" answer and refuses to treat
it as consent. Nothing auto-publishes; everything lands as `status: draft`. But
somebody has to read that flag before promoting a project.

Consider splitting it in two, because they are different permissions:

- may we exhibit this work in the show?
- may we publish it on the archive site, indefinitely?

---

## 7. Vocabulary reference

The form's tag list should match `content/vocabularies.json`. Anything that
doesn't match is routed to `tags` by `config/form-map.yaml`.

**Currently offered and in use (2025 counts):**

`code` 19 · `games` 14 · `physical computing` 14 · `digital fabrication` 12 ·
`installation` 11 · `audio/sound` 11 · `performance` 8 · `sound` 7 ·
`3D printing` 6 · `web` 5 · `video` 5 · `sculpture` 5 · `wearables` 4 ·
`3D animation` 3 · `illustration` 3 · `AI` 3 · `augmented reality` 3 ·
`virtual reality` 2 · `mobile` 2 · `data visualization` 1

**In the archive but not offered on the form.** These exist in past years. Add
them only if they're still live categories — otherwise they stay historical,
which is fine:

| Value | Archived projects |
| --- | ---: |
| Photography | 5 |
| Generative | 3 |
| NIME | 3 |
| Character Art | 2 |
| Interactive Documentary | 2 |
| Robotics | 2 |
| Speculative Fiction | 2 |
| UX | 2 |

**Affiliation** — five values, unchanged:

`Undergraduate` · `Graduate` · `Alumni` · `Faculty` · `UG Thesis`

Note that `UG Thesis` never appears alone; all 17 archived cases are also
`Undergraduate`. If the form offers it, expect both to be ticked.

---

## 8. After changing the form

1. Run a test submission end to end.
2. Export the sheet and dry-run the ingest:

   ```bash
   node scripts/ingest.mjs --sheet test.xlsx --show 2026 --media ~/sharepoint-sync --dry-run
   ```

3. Check the warnings. If a column header was reworded, ingest says
   `no column matched: <field>` — fix the pattern in `config/form-map.yaml`,
   not the code.
4. Confirm the synced filenames still carry the `_<Submitter Name>` suffix that
   ingest matches on. If the sync client changes that, resolution breaks
   silently and every project reports missing files.

**Never add a column containing student emails or ID numbers to the mapping.**
`config/form-map.yaml` is a whitelist precisely so that a new PII column in the
form cannot reach git by default.
