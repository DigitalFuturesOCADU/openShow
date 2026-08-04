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
| 2019-december | 20 | 20/20 | 20/20 |
| 2019-february | 18 | 18/18 | 18/18 |
| 2020 | 58 | 58/58 | 56/58 (97%) |
| 2021 | 11 | 11/11 | 11/11 |
| 2022 | 37 | 33/37 (89%) | 37/37 |
| 2023 | 29 | 27/29 (93%) | 29/29 |
| 2024 | 29 | 24/29 (83%) | 29/29 |
| 2025 | 36 | 35/36 (97%) | 36/36 |
| no show | 2 | 0/2 (0%) | 0/2 (0%) |

**WordPress recorded no affiliation for the 2025 show at all** — not scatter or
export loss, simply no 2025 term carrying one. 35 of 36 have since been recovered from the Microsoft Forms submission sheet and applied through `config/overrides.yaml` (35 overrides). The remaining 1 are listed there and need a human.

Across 2019–2024 the same axis is 191/202 (95%) complete, so the gap was a
single-year regression rather than long-standing decay.

The lasting point is that the submission form already collects this cleanly, as
a controlled multi-select, and WordPress simply never received it. Wiring the
form to the content is what stops the next such year, which is Step 7.

## Cost of the drop decisions

8 projects lost at least one term to a drop.
**0 of them lost their only medium** — every affected project kept other mediums, so nothing became undiscoverable.

| ID | Title | Dropped | Retained |
| --- | --- | --- | --- |
| 1881 | Solely | Business | 3d-printing, digital-fabrication |
| 2450 | Meditative Digital Detox Zone | Wellness | code, installation, sculpture, web |
| 2041 | AI Alphabet | Typography | ai, code |
| 2149 | Bodies in Play Zine | Speculative | vr, wearables |
| 2259 | Benches | Networked | code, installation, physical-computing, sculpture |
| 2341 | //generative(systems); | Algorithm Design, Art Movement, Automation | code, generative, installation |
| 2580 | Into The Deaths Of Space | Digital Artwork | code, digital-fabrication, photography |
| 3008 | Jailbreaking Canada Playshop | Design, Playshop | games |

## Projects with no medium (4)

Not caused by the drop decisions — see above. These carry no medium term in the
source data at all, so they will not appear under any medium filter.
4 are published.

| ID | Status | Title | Source terms |
| --- | --- | --- | --- |
| 1726 | publish | Infranet | 2020 Faculty, Open Show 2020 |
| 1959 | publish | united tissues_mourning process | 2020 Faculty, Open Show 2020 |
| 1969 | publish | Diver | _none — no categories_ |
| 2118 | publish | MetaHospital | _none — no categories_ |
