---
id: 2712
slug: blue-gaze
title: Blue Gaze
show: '2024'
year: 2024
session: null
affiliation:
  - graduate
medium:
  - code
  - digital-fabrication
  - installation
  - physical-computing
  - sculpture
tags: []
credits:
  - personId: olivia-pasian
    name: Olivia Pasian
    role: null
  - personId: paul-van-rijn
    name: Paul Van Rijn
    role: null
  - personId: kasper-zhang
    name: Kasper Zhang
    role: null
creditsRaw: Olivia Pasian, Paul Van Rijn, Kasper Zhang
media:
  - type: image
    id: 2715
    file: 2024/12/BlueGaze_3_Kasper-Zhang.jpg
    role: featured
    alt: null
    caption: null
  - type: image
    id: 2713
    file: 2024/12/BlueGaze_1_Kasper-Zhang.png
    alt: Blue Gaze
    caption: Blue Gaze
  - type: image
    id: 2714
    file: 2024/12/BlueGaze_2_Kasper-Zhang-scaled.jpg
    alt: null
    caption: null
  - type: image
    id: 2716
    file: 2024/12/BlueGaze_4_Kasper-Zhang.png
    alt: null
    caption: null
layout: default
links:
  - label: Project
    url: https://blogs.ocaduwebspace.ca/digf-6037-301-2024fa/2024/11/12/blue-gaze/
    status: unchecked
status: publish
sourceTerms:
  - 2024 Code
  - 2024 Digital Fabrication
  - 2024 Graduate
  - 2024 Installation
  - 2024 Physical Computing
  - 2024 Sculpture
  - Open Show 2024
wordpress:
  postDate: '2024-12-08 16:36:33'
  originalSlug: blue-gaze
  link: https://df.show/portfolio/items/blue-gaze
---

"“Blue Gaze” is an emotional animatronic bird who looks at the people around it and reacts with an animated dance that expresses its feelings.

It’s made up of a cardboard, paper, servos, an Arduino, and code.

The bird uses the camera in its chest and software to count the number of people in its view — and to assess where they are looking. Too many people or prolonged stares make the bird uncomfortable, but it is happy to have a visitor or two.

The emotional responses are not based on a real bird’s behaviour and are not necessarily an anthropomorphic representation, but rather a unique personality with three set states: The first is neutral, where the bird calmly looks around and gently flaps its wings. The second is happy, where the bird excitedly bops up and down and shows off its feathers. The third state is stressed, where the bird fully tilts itself down and anxiously twitches its wings and head.

Conceptually, “Blue Gaze” seeks to represent the power imbalance and discomfort of an objectifying gaze. It encourages visitors to read the bird’s body language to consider the effect of their interactions.

The primary hardware components of the bird are four servo motors connected to an Arduino Nano33 IOT, mounted on a protoboard which is connected to a laptop via USB cables. The laptop is running p5.js code which sends servo angles to the Arduino, connecting the body tracking data from the camera to the servo animations, then calculating the emotional states with case switching. "
