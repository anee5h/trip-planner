# KAI-43 card density evidence

Captured from the local Vite app with the same destination grid and viewport
before and after the card-density changes.

| View        | Before                                    | After                                   | Representative card height       |
| ----------- | ----------------------------------------- | --------------------------------------- | -------------------------------- |
| EN · 390px  | [before](destinations-en-390-before.png)  | [after](destinations-en-390-after.png)  | 379px → 318px (−61px, about 16%) |
| JA · 430px  | [before](destinations-ja-430-before.png)  | [after](destinations-ja-430-after.png)  | 379px → 317px (−62px, about 16%) |
| EN · 1440px | [before](destinations-en-1440-before.png) | [after](destinations-en-1440-after.png) | 445px → 397px (−48px, about 11%) |

The Home recommendation rail keeps its aligned 390px height at about 257px
because the compact card retains the strongest reason and existing cost data.
It removes the mobile subtitle and weather-only detail without dropping
decision-critical travel, cost, or warning states.

## Home 2D1N follow-up

[EN · 1440px Home weekend screenshot](home-weekend-en-1440-after.png)

The post-review weekend cards measure about 294px high in this desktop state.
Their metadata begins about 12px after the title, with one detailed travel row;
the repeated one-way travel reason is suppressed and one-place English copy
renders as “1 place”.
