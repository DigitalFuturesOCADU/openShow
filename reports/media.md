# Media

## Accessibility: alt text is effectively absent

| | Count |
| --- | ---: |
| Image references with alt text | 10 |
| Image references **without** alt text | 694 |

PLAN.md Phase 2 assumed alt text would carry across from the attachment records
and called it "the main thing the WXR gives that a scrape would not". In fact
only 14 of 850 attachments carry any alt attribute, and the values are
placeholders ("Person Image", "Abha Patil Font") rather than descriptions.

**Alt text has to be authored, not migrated.** See EXECUTION.md §6.2.

## Self-hosted video (4 projects, 112.8 MB)

| Project | Title | File |
| --- | --- | --- |
| 1925 | Student Collective | `2020/12/SimonRabyniuk_TO-Housing-Works-Exert.mp4` |
| 2522 | Instagram Filters | `2023/12/AudioReactiveFilterDemo_anonymous.mov` |
| 2041 | AI Alphabet | `2022/12/AI-Alphabet_2_Christina-Chen.mp4` |
| 2151 | Egg | `2022/12/TorSeverino_Egg_Victoria-Severino.mp4` |

## Embedded video (4)

| Project | Provider | ID |
| --- | --- | --- |
| 1917 | vimeo | `407755209` |
| 1932 | vimeo | `404385691` |
| 1605 | youtube | `xwzhz1THW24` |
| 2060 | youtube | `ncIRkjK-ywk` |

## External links (235)

| State | Links |
| --- | ---: |
| ok | 111 |
| unreachable | 58 |
| dead | 35 |
| redirect | 31 |

**93 of 235 link nowhere.** That is decay, not a
migration fault — these were live when they were submitted.

Concentrated by host, which matters: this is mostly one
platform going away rather than scattered rot.

| Host | Broken |
| --- | ---: |
| blog.ocad.ca | 38 |
| webspace.ocad.ca | 5 |
| artstation.com | 2 |
| 2022atil3-eer.itch.io | 2 |
| ? | 2 |
| theworld.org | 1 |

Re-check with `node scripts/check-links.mjs`, or `--stale 30` to refresh only
entries older than a month.
