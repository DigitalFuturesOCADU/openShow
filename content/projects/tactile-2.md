---
id: 2831
slug: tactile-2
title: TacTile
show: '2024'
year: 2024
session: null
affiliation:
  - graduate
medium:
  - code
  - digital-fabrication
  - performance
  - physical-computing
  - sound
tags: []
credits:
  - personId: aranya-khurana
    name: Aranya Khurana
    role: null
creditsRaw: Aranya Khurana
media:
  - type: image
    id: 2772
    file: 2024/12/TacTile2024_3_Aranya-Khurana.png
    role: featured
    bytes: 9075993
    alt: null
    caption: null
  - type: image
    id: 2773
    file: 2024/12/TacTile2024_4_Aranya-Khurana.png
    bytes: 8460122
    alt: null
    caption: null
  - type: image
    id: 2771
    file: 2024/12/TacTile2024_2_Aranya-Khurana.png
    bytes: 9950251
    alt: null
    caption: null
  - type: image
    id: 2770
    file: 2024/12/TacTile2024_1_Aranya-Khurana.png
    bytes: 9825971
    alt: null
    caption: null
layout: default
links:
  - label: Project
    url: https://df.show/portfolio/items/tactile
    status: unchecked
status: publish
sourceTerms:
  - 2024 Code
  - 2024 Digital Fabrication
  - 2024 Graduate
  - 2024 Performance
  - 2024 Physical Computing
  - 2024 Sound
  - Open Show 2024
wordpress:
  postDate: '2024-12-09 04:08:51'
  originalSlug: tactile-2
  link: https://df.show/portfolio/items/tactile-2
---

"TacTile is a touch-sensitive fabric-based matrix intended to function as a New Interface for Musical Expression (NIME). It was designed and developed as part of an OCAD U Graduate course of the same name. The project is an eTextile that integrates materials and learnings from the Advanced Wearables elective.

The design features 2 sets of parallel strips of conductive fabric separated by piezoresistive material (velostat or Eeonyx). Both sets of strips connect to a Teensy 3.5 microcontroller: one set to digital pins, the other to analog pins with the latter reading off values.

These values are interpreted and sent to Python (earlier versions used Processing and Max/MSP) where a OpenCV's blob tracking algorithm interprets touches and assigns parameters such as blob IDs, x-position, y-position, size and pressure. These parameters are then used for sound generation by controlling MIDI note values which are sent to VST plugins synths in Ableton Live.  

This project is a work in progress and currently undergoing further prototyping and development as part of Aranya Khurana’s Masters Thesis project at the Digital Futures Graduate programme.

The design and code draws on openly available resources from and owes significant thanks to Maurin Donneaud, Plusea, Kobakant/How to Get What You Want and Tom Igoe. Developed as part of courses offered by and under the guidance of Adam Tindale and Kate Hartman.
