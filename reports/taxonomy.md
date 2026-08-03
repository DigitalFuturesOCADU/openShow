# Taxonomy normalisation

189 raw terms → 27 medium + 5 affiliation values.

Mapping applied from `config/taxonomy-map.yaml` (reviewed).

## Medium (27)

- `3d-printing`
- `ai`
- `animation`
- `ar`
- `character-art`
- `code`
- `data-visualization`
- `digital-fabrication`
- `games`
- `generative`
- `illustration`
- `installation`
- `interactive-documentary`
- `mobile`
- `nime`
- `performance`
- `photography`
- `physical-computing`
- `robotics`
- `sculpture`
- `sound`
- `speculative-fiction`
- `ux`
- `video`
- `vr`
- `wearables`
- `web`

## Affiliation (5)

- `alumni`
- `faculty`
- `graduate`
- `ug-thesis`
- `undergraduate`

## Dropped terms

| Term | Items |
| --- | ---: |
| Data Transformation | 1 |
| Business | 1 |
| Wellness | 1 |
| Typography | 1 |
| Speculative | 1 |
| Networked | 1 |
| Algorithm Design | 1 |
| Art Movement | 1 |
| Automation | 1 |
| Digital Artwork | 1 |
| Design | 1 |
| Playshop | 1 |

## Axis coverage by show

How complete each axis is, per show. A filter is only as useful as its
coverage: an axis at 0% for a given year means that year vanishes from it.

| Show | Items | Has affiliation | Has medium |
| --- | ---: | ---: | ---: |
| 2019-december | 30 | 28/30 (93%) | 30/30 |
| 2019-february | 20 | 20/20 | 20/20 |
| 2020 | 58 | 58/58 | 56/58 (97%) |
| 2021 | 11 | 11/11 | 11/11 |
| 2022 | 37 | 33/37 (89%) | 37/37 |
| 2023 | 30 | 28/30 (93%) | 30/30 |
| 2024 | 32 | 26/32 (81%) | 32/32 |
| 2025 | 38 | 36/38 (95%) | 38/38 |
| no show | 8 | 0/8 (0%) | 0/8 (0%) |

**WordPress recorded no affiliation for the 2025 show at all** — not scatter or
export loss, simply no 2025 term carrying one. 36 of 38 have since been recovered from the Microsoft Forms submission sheet and applied through `config/overrides.yaml` (36 overrides). The remaining 2 are listed there and need a human.

Across 2019–2024 the same axis is 204/218 (94%) complete, so the gap was a
single-year regression rather than long-standing decay.

The lasting point is that the submission form already collects this cleanly, as
a controlled multi-select, and WordPress simply never received it. Wiring the
form to the content is what stops the next such year, which is Step 7.

## Cost of the drop decisions

9 projects lost at least one term to a drop.
**0 of them lost their only medium** — every affected project kept other mediums, so nothing became undiscoverable.

| ID | Title | Dropped | Retained |
| --- | --- | --- | --- |
| 2258 | The Decoding Origins Web Portal: Creating a Visual Database with Archival Sources from the Era of African Slavery | Data Transformation | ai, code, data-visualization, web |
| 1881 | Solely | Business | 3d-printing, digital-fabrication |
| 2450 | Meditative Digital Detox Zone | Wellness | code, installation, sculpture, web |
| 2041 | AI Alphabet | Typography | ai, code |
| 2149 | Bodies in Play Zine | Speculative | vr, wearables |
| 2259 | Benches | Networked | code, installation, physical-computing, sculpture |
| 2341 | //generative(systems); | Algorithm Design, Art Movement, Automation | code, generative, installation |
| 2580 | Into The Deaths Of Space | Digital Artwork | code, digital-fabrication, photography |
| 3008 | Jailbreaking Canada Playshop | Design, Playshop | games |

## Projects with no medium (10)

Not caused by the drop decisions — see above. These carry no medium term in the
source data at all, so they will not appear under any medium filter.
4 are published.

| ID | Status | Title | Source terms |
| --- | --- | --- | --- |
| 1553 | draft | Emolace | _none — no categories_ |
| 1572 | draft | Digital Debris | _none — no categories_ |
| 1574 | draft | Observation. How technology can help reduce gaps between genders | _none — no categories_ |
| 1576 | draft | The Strange and the Beautiful | _none — no categories_ |
| 2333 | stub | Synchrobots | _none — no categories_ |
| 2595 | stub | Vibrating Knee Brace | _none — no categories_ |
| 1726 | publish | Infranet | 2020 Faculty, Open Show 2020 |
| 1959 | publish | united tissues_mourning process | 2020 Faculty, Open Show 2020 |
| 1969 | publish | Diver | _none — no categories_ |
| 2118 | publish | MetaHospital | _none — no categories_ |
