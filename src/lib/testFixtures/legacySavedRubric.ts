/**
 * Test data only, never imported by app code.
 * The shape of practical-benchmark rows an older Advantage build saved into a
 * student's file (ids, stages, technique links, policies). Names and wording are
 * placeholders. Tests use it to prove saved rows survive load and still link.
 */

import type { RubricLevel, StudentProgressReport } from '../progress/types.ts';

const LEGACY_SAVED_LEVELS = [
 {
  "id": "level.white",
  "name": "White",
  "belt": "white",
  "starterAck": true,
  "checkpoints": [
   {
    "id": "checkpoint.white.s1-positions",
    "name": "Saved white benchmark s1-positions",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s1-positions",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.closed-guard",
        "name": "Closed guard"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.back-control",
        "name": "Back control"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-1",
    "noGiVariant": "No-gi version of saved benchmark s1-positions."
   },
   {
    "id": "checkpoint.white.s1-escapes",
    "name": "Saved white benchmark s1-escapes",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s1-escapes",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.white.s1-guard-attack",
    "name": "Saved white benchmark s1-guard-attack",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s1-guard-attack",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sweep.scissor",
        "name": "Scissor sweep"
       },
       {
        "id": "sweep.hip-bump",
        "name": "Hip bump sweep"
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-1",
    "noGiVariant": "No-gi version of saved benchmark s1-guard-attack."
   },
   {
    "id": "checkpoint.white.s1-pass",
    "name": "Saved white benchmark s1-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s1-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-1",
    "noGiVariant": "No-gi version of saved benchmark s1-pass."
   },
   {
    "id": "checkpoint.white.s1-conduct",
    "name": "Saved white benchmark s1-conduct",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.white.s2-movement",
    "name": "Saved white benchmark s2-movement",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s2-movement",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "move.breakfalls",
        "name": "Breakfalls"
       },
       {
        "id": "move.shrimp",
        "name": "Shrimp"
       },
       {
        "id": "move.bridge",
        "name": "Bridge"
       },
       {
        "id": "move.technical-standup",
        "name": "Technical lift/stand-up"
       }
      ],
      "met": null,
      "note": "",
      "match": "all",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.white.s2-escape-resist",
    "name": "Saved white benchmark s2-escape-resist",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s2-escape-resist",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.white.s2-back",
    "name": "Saved white benchmark s2-back",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s2-back",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.back",
        "name": "Back escape"
       },
       {
        "id": "pos.back-control",
        "name": "Back control"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-back."
   },
   {
    "id": "checkpoint.white.s2-guards",
    "name": "Saved white benchmark s2-guards",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s2-guards",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       },
       {
        "id": "pos.open-guard",
        "name": "Open guard"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-guards."
   },
   {
    "id": "checkpoint.white.s2-second-attack",
    "name": "Saved white benchmark s2-second-attack",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s2-second-attack",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sweep.tripod",
        "name": "Tripod sweep"
       },
       {
        "id": "sweep.pendulum",
        "name": "Pendulum sweep"
       },
       {
        "id": "sweep.flower",
        "name": "Flower sweep"
       },
       {
        "id": "sub.guillotine",
        "name": "Guillotine"
       },
       {
        "id": "sub.triangle",
        "name": "Triangle"
       },
       {
        "id": "sub.cross-collar",
        "name": "Cross collar choke",
        "style": "gi"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-second-attack."
   },
   {
    "id": "checkpoint.white.s2-two-passes",
    "name": "Saved white benchmark s2-two-passes",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s2-two-passes",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       },
       {
        "id": "pass.torreando",
        "name": "Torreando pass"
       },
       {
        "id": "pass.stack",
        "name": "Stack pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-two-passes."
   },
   {
    "id": "checkpoint.white.s3-kob",
    "name": "Saved white benchmark s3-kob",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s3-kob",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       },
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.white.s3-defense",
    "name": "Saved white benchmark s3-defense",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s3-defense",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "def.guard-retention",
        "name": "Guard retention"
       },
       {
        "id": "def.submission-defense",
        "name": "Submission defense"
       },
       {
        "id": "def.sprawl",
        "name": "Sprawl"
       }
      ],
      "met": null,
      "note": "",
      "match": "all",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-defense."
   },
   {
    "id": "checkpoint.white.s3-triangle",
    "name": "Saved white benchmark s3-triangle",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s3-triangle",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.triangle",
        "name": "Triangle"
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.white.s3-half",
    "name": "Saved white benchmark s3-half",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s3-half",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       },
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-half."
   },
   {
    "id": "checkpoint.white.s3-arm-attack",
    "name": "Saved white benchmark s3-arm-attack",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s3-arm-attack",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.americana",
        "name": "Americana"
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.white.s3-live",
    "name": "Saved white benchmark s3-live",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.white.s4-back-choke",
    "name": "Saved white benchmark s4-back-choke",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s4-back-choke",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.back-control",
        "name": "Back control"
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-back-choke."
   },
   {
    "id": "checkpoint.white.s4-arm-drag",
    "name": "Saved white benchmark s4-arm-drag",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s4-arm-drag",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.arm-drag",
        "name": "Arm drag"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-arm-drag."
   },
   {
    "id": "checkpoint.white.s4-single",
    "name": "Saved white benchmark s4-single",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s4-single",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.single-leg",
        "name": "Single leg"
       },
       {
        "id": "td.double-leg",
        "name": "Double leg"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-single."
   },
   {
    "id": "checkpoint.white.s4-open-pass",
    "name": "Saved white benchmark s4-open-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s4-open-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.torreando",
        "name": "Torreando pass"
       },
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       },
       {
        "id": "pass.stack",
        "name": "Stack pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-open-pass."
   },
   {
    "id": "checkpoint.white.s4-sweep",
    "name": "Saved white benchmark s4-sweep",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s4-sweep",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sweep.tripod",
        "name": "Tripod sweep"
       },
       {
        "id": "sweep.flower",
        "name": "Flower sweep"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-sweep."
   },
   {
    "id": "checkpoint.white.s4-ankle",
    "name": "Saved white benchmark s4-ankle",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.s4-ankle",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.straight-ankle-lock",
        "name": "Straight ankle lock"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-4",
    "policy": "straight-ankle"
   },
   {
    "id": "checkpoint.white.promo-hierarchy",
    "name": "Saved white benchmark promo-hierarchy",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-hierarchy",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.closed-guard",
        "name": "Closed guard"
       },
       {
        "id": "pos.open-guard",
        "name": "Open guard"
       },
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       },
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "pos.back-control",
        "name": "Back control"
       },
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.white.promo-keep-guard",
    "name": "Saved white benchmark promo-keep-guard",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-keep-guard",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.closed-guard",
        "name": "Closed guard",
        "targetLevel": 4
       },
       {
        "id": "pos.open-guard",
        "name": "Open guard",
        "targetLevel": 3
       },
       {
        "id": "def.guard-retention",
        "name": "Guard retention",
        "targetLevel": 3
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "promotion",
    "noGiVariant": "No-gi version of saved benchmark promo-keep-guard."
   },
   {
    "id": "checkpoint.white.promo-escape",
    "name": "Saved white benchmark promo-escape",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-escape",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape",
        "targetLevel": 4
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape",
        "targetLevel": 4
       },
       {
        "id": "escape.back",
        "name": "Back escape",
        "targetLevel": 3
       },
       {
        "id": "def.submission-defense",
        "name": "Submission defense",
        "targetLevel": 3
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.white.promo-hold",
    "name": "Saved white benchmark promo-hold",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-hold",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "pos.back-control",
        "name": "Back control"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "promotion",
    "noGiVariant": "No-gi version of saved benchmark promo-hold."
   },
   {
    "id": "checkpoint.white.promo-sets",
    "name": "Saved white benchmark promo-sets",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-sets",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sweep.scissor",
        "name": "Scissor sweep"
       },
       {
        "id": "sweep.hip-bump",
        "name": "Hip bump sweep"
       },
       {
        "id": "sweep.tripod",
        "name": "Tripod sweep"
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.triangle",
        "name": "Triangle"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "promotion",
    "noGiVariant": "No-gi version of saved benchmark promo-sets."
   },
   {
    "id": "checkpoint.white.promo-pass",
    "name": "Saved white benchmark promo-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       },
       {
        "id": "pass.torreando",
        "name": "Torreando pass"
       },
       {
        "id": "pass.stack",
        "name": "Stack pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.white.promo-standing",
    "name": "Saved white benchmark promo-standing",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-standing",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.single-leg",
        "name": "Single leg"
       },
       {
        "id": "td.double-leg",
        "name": "Double leg"
       },
       {
        "id": "td.hip-throw",
        "name": "Hip throw"
       },
       {
        "id": "td.arm-drag",
        "name": "Arm drag"
       },
       {
        "id": "def.sprawl",
        "name": "Sprawl"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "promotion",
    "noGiVariant": "No-gi version of saved benchmark promo-standing."
   },
   {
    "id": "checkpoint.white.promo-half",
    "name": "Saved white benchmark promo-half",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.white.promo-half",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "promotion",
    "noGiVariant": "No-gi version of saved benchmark promo-half."
   },
   {
    "id": "checkpoint.white.promo-rounds",
    "name": "Saved white benchmark promo-rounds",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.white.promo-conduct",
    "name": "Saved white benchmark promo-conduct",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion",
    "rulebook": true
   }
  ]
 },
 {
  "id": "level.blue",
  "name": "Blue",
  "belt": "blue",
  "starterAck": true,
  "checkpoints": [
   {
    "id": "checkpoint.blue.s1-escapes",
    "name": "Saved blue benchmark s1-escapes",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s1-escapes",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape"
       },
       {
        "id": "escape.back",
        "name": "Back escape"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.blue.s1-defend",
    "name": "Saved blue benchmark s1-defend",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s1-defend",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "def.submission-defense",
        "name": "Submission defense"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1",
    "noGiVariant": "No-gi version of saved benchmark s1-defend."
   },
   {
    "id": "checkpoint.blue.s1-half-bottom",
    "name": "Saved blue benchmark s1-half-bottom",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s1-half-bottom",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1",
    "noGiVariant": "No-gi version of saved benchmark s1-half-bottom."
   },
   {
    "id": "checkpoint.blue.s1-half-top",
    "name": "Saved blue benchmark s1-half-top",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s1-half-top",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.blue.s1-turtle",
    "name": "Saved blue benchmark s1-turtle",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s1-turtle",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.turtle",
        "name": "Turtle"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.blue.s1-conduct",
    "name": "Saved blue benchmark s1-conduct",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.blue.s2-open",
    "name": "Saved blue benchmark s2-open",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s2-open",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.open-guard",
        "name": "Open guard",
        "targetLevel": 4
       },
       {
        "id": "sweep.tripod",
        "name": "Tripod sweep",
        "targetLevel": 3
       },
       {
        "id": "sweep.pendulum",
        "name": "Pendulum sweep",
        "targetLevel": 3
       },
       {
        "id": "sweep.flower",
        "name": "Flower sweep",
        "targetLevel": 3
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-open."
   },
   {
    "id": "checkpoint.blue.s2-butterfly",
    "name": "Saved blue benchmark s2-butterfly",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s2-butterfly",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.butterfly-guard",
        "name": "Butterfly guard"
       },
       {
        "id": "sweep.butterfly",
        "name": "Butterfly sweep"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.blue.s2-omoplata",
    "name": "Saved blue benchmark s2-omoplata",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s2-omoplata",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.omoplata",
        "name": "Omoplata",
        "targetLevel": 3
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard",
        "targetLevel": 4
       },
       {
        "id": "sub.triangle",
        "name": "Triangle",
        "targetLevel": 4
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.blue.s2-connect",
    "name": "Saved blue benchmark s2-connect",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s2-connect",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.triangle",
        "name": "Triangle"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.guillotine",
        "name": "Guillotine"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.blue.s2-retention",
    "name": "Saved blue benchmark s2-retention",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s2-retention",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "def.guard-retention",
        "name": "Guard retention"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.blue.s2-your-guard",
    "name": "Saved blue benchmark s2-your-guard",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.blue.s3-pass",
    "name": "Saved blue benchmark s3-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s3-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.torreando",
        "name": "Torreando pass"
       },
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-pass."
   },
   {
    "id": "checkpoint.blue.s3-pins",
    "name": "Saved blue benchmark s3-pins",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s3-pins",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.north-south",
        "name": "North-south"
       },
       {
        "id": "pos.scarf-hold",
        "name": "Scarf hold"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.blue.s3-mount",
    "name": "Saved blue benchmark s3-mount",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s3-mount",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-mount."
   },
   {
    "id": "checkpoint.blue.s3-americana",
    "name": "Saved blue benchmark s3-americana",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s3-americana",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.americana",
        "name": "Americana"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.blue.s3-kob",
    "name": "Saved blue benchmark s3-kob",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s3-kob",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.blue.s3-headlock",
    "name": "Saved blue benchmark s3-headlock",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s3-headlock",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.headlock",
        "name": "Headlock escape"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.blue.s4-back",
    "name": "Saved blue benchmark s4-back",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s4-back",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.back-control",
        "name": "Back control"
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-back."
   },
   {
    "id": "checkpoint.blue.s4-takedowns",
    "name": "Saved blue benchmark s4-takedowns",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s4-takedowns",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.double-leg",
        "name": "Double leg"
       },
       {
        "id": "td.single-leg",
        "name": "Single leg"
       },
       {
        "id": "td.arm-drag",
        "name": "Arm drag"
       },
       {
        "id": "td.hip-throw",
        "name": "Hip throw"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-4",
    "noGiVariant": "No-gi version of saved benchmark s4-takedowns."
   },
   {
    "id": "checkpoint.blue.s4-sprawl",
    "name": "Saved blue benchmark s4-sprawl",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s4-sprawl",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "def.sprawl",
        "name": "Sprawl",
        "targetLevel": 4
       },
       {
        "id": "sub.guillotine",
        "name": "Guillotine",
        "targetLevel": 3
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.blue.s4-ankle",
    "name": "Saved blue benchmark s4-ankle",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s4-ankle",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.straight-ankle-lock",
        "name": "Straight ankle lock"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 3
     }
    ],
    "stage": "stripe-4",
    "policy": "straight-ankle"
   },
   {
    "id": "checkpoint.blue.s4-wrist",
    "name": "Saved blue benchmark s4-wrist",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.s4-wrist",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.wrist-lock",
        "name": "Wrist lock"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 2
     }
    ],
    "stage": "stripe-4",
    "policy": "wrist-lock"
   },
   {
    "id": "checkpoint.blue.s4-review",
    "name": "Saved blue benchmark s4-review",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.blue.promo-connect",
    "name": "Saved blue benchmark promo-connect",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-game",
    "name": "Saved blue benchmark promo-game",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-guard",
    "name": "Saved blue benchmark promo-guard",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-guard",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.closed-guard",
        "name": "Closed guard"
       },
       {
        "id": "pos.open-guard",
        "name": "Open guard"
       },
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       },
       {
        "id": "def.guard-retention",
        "name": "Guard retention"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-bottom",
    "name": "Saved blue benchmark promo-bottom",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-bottom",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sweep.scissor",
        "name": "Scissor sweep"
       },
       {
        "id": "sweep.hip-bump",
        "name": "Hip bump sweep"
       },
       {
        "id": "sweep.tripod",
        "name": "Tripod sweep"
       },
       {
        "id": "sweep.pendulum",
        "name": "Pendulum sweep"
       },
       {
        "id": "sweep.flower",
        "name": "Flower sweep"
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.triangle",
        "name": "Triangle"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.omoplata",
        "name": "Omoplata"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "promotion",
    "noGiVariant": "No-gi version of saved benchmark promo-bottom."
   },
   {
    "id": "checkpoint.blue.promo-pass",
    "name": "Saved blue benchmark promo-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.torreando",
        "name": "Torreando pass"
       },
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       },
       {
        "id": "pass.leg-drag",
        "name": "Leg drag"
       },
       {
        "id": "pass.stack",
        "name": "Stack pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-top",
    "name": "Saved blue benchmark promo-top",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-top",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.americana",
        "name": "Americana"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-back",
    "name": "Saved blue benchmark promo-back",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-back",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.back-control",
        "name": "Back control"
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-defense",
    "name": "Saved blue benchmark promo-defense",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-defense",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape"
       },
       {
        "id": "escape.back",
        "name": "Back escape"
       },
       {
        "id": "def.submission-defense",
        "name": "Submission defense"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-standing",
    "name": "Saved blue benchmark promo-standing",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.blue.promo-standing",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.double-leg",
        "name": "Double leg",
        "targetLevel": 3
       },
       {
        "id": "td.single-leg",
        "name": "Single leg",
        "targetLevel": 3
       },
       {
        "id": "td.arm-drag",
        "name": "Arm drag",
        "targetLevel": 3
       },
       {
        "id": "td.hip-throw",
        "name": "Hip throw",
        "targetLevel": 3
       },
       {
        "id": "def.sprawl",
        "name": "Sprawl",
        "targetLevel": 4
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.blue.promo-share",
    "name": "Saved blue benchmark promo-share",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   }
  ]
 },
 {
  "id": "level.purple",
  "name": "Purple",
  "belt": "purple",
  "starterAck": true,
  "checkpoints": [
   {
    "id": "checkpoint.purple.s1-escapes",
    "name": "Saved purple benchmark s1-escapes",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s1-escapes",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape"
       },
       {
        "id": "escape.back",
        "name": "Back escape"
       },
       {
        "id": "pos.north-south",
        "name": "North-south"
       },
       {
        "id": "pos.scarf-hold",
        "name": "Scarf hold"
       },
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.purple.s1-defend",
    "name": "Saved purple benchmark s1-defend",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s1-defend",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "def.submission-defense",
        "name": "Submission defense"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.purple.s1-retention",
    "name": "Saved purple benchmark s1-retention",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s1-retention",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "def.guard-retention",
        "name": "Guard retention"
       },
       {
        "id": "pos.open-guard",
        "name": "Open guard"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.purple.s1-turtle",
    "name": "Saved purple benchmark s1-turtle",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s1-turtle",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.turtle",
        "name": "Turtle"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.purple.s1-leglock",
    "name": "Saved purple benchmark s1-leglock",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1",
    "noGiVariant": "No-gi version of saved benchmark s1-leglock.",
    "policy": "leg-lock"
   },
   {
    "id": "checkpoint.purple.s1-conduct",
    "name": "Saved purple benchmark s1-conduct",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.purple.s2-pass",
    "name": "Saved purple benchmark s2-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s2-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.leg-drag",
        "name": "Leg drag"
       },
       {
        "id": "pass.stack",
        "name": "Stack pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-pass."
   },
   {
    "id": "checkpoint.purple.s2-pins",
    "name": "Saved purple benchmark s2-pins",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s2-pins",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       },
       {
        "id": "pos.mount",
        "name": "Mount"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.purple.s2-mount",
    "name": "Saved purple benchmark s2-mount",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s2-mount",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-mount."
   },
   {
    "id": "checkpoint.purple.s2-back",
    "name": "Saved purple benchmark s2-back",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s2-back",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.back-control",
        "name": "Back control",
        "targetLevel": 5
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke",
        "targetLevel": 4
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.purple.s2-weight",
    "name": "Saved purple benchmark s2-weight",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.purple.s2-second-guard",
    "name": "Saved purple benchmark s2-second-guard",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s2-second-guard",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.open-guard",
        "name": "Open guard",
        "targetLevel": 5
       },
       {
        "id": "sweep.flower",
        "name": "Flower sweep",
        "targetLevel": 4
       },
       {
        "id": "sweep.pendulum",
        "name": "Pendulum sweep",
        "targetLevel": 4
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "stripe-2",
    "noGiVariant": "No-gi version of saved benchmark s2-second-guard."
   },
   {
    "id": "checkpoint.purple.s3-takedowns",
    "name": "Saved purple benchmark s3-takedowns",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s3-takedowns",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.double-leg",
        "name": "Double leg"
       },
       {
        "id": "td.single-leg",
        "name": "Single leg"
       },
       {
        "id": "td.arm-drag",
        "name": "Arm drag"
       },
       {
        "id": "td.hip-throw",
        "name": "Hip throw"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-takedowns."
   },
   {
    "id": "checkpoint.purple.s3-counter",
    "name": "Saved purple benchmark s3-counter",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s3-counter",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.guillotine",
        "name": "Guillotine"
       },
       {
        "id": "def.sprawl",
        "name": "Sprawl"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.purple.s3-scrambles",
    "name": "Saved purple benchmark s3-scrambles",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.purple.s3-decide",
    "name": "Saved purple benchmark s3-decide",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.purple.s3-leglock",
    "name": "Saved purple benchmark s3-leglock",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s3-leglock",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.straight-ankle-lock",
        "name": "Straight ankle lock"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-leglock.",
    "policy": "leg-lock"
   },
   {
    "id": "checkpoint.purple.s3-headlock",
    "name": "Saved purple benchmark s3-headlock",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s3-headlock",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.headlock",
        "name": "Headlock escape"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 4
     }
    ],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.purple.s4-finish",
    "name": "Saved purple benchmark s4-finish",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s4-finish",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke"
       },
       {
        "id": "sub.guillotine",
        "name": "Guillotine"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.purple.s4-strategy",
    "name": "Saved purple benchmark s4-strategy",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.purple.s4-teach",
    "name": "Saved purple benchmark s4-teach",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.s4-teach",
      "requirement": "",
      "techniqueRefs": [],
      "met": null,
      "note": "",
      "catalogNeed": {
       "count": 3,
       "level": 5
      }
     }
    ],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.purple.s4-mentor",
    "name": "Saved purple benchmark s4-mentor",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.purple.s4-review",
    "name": "Saved purple benchmark s4-review",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.purple.s4-everyone",
    "name": "Saved purple benchmark s4-everyone",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.purple.promo-game",
    "name": "Saved purple benchmark promo-game",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-defense",
    "name": "Saved purple benchmark promo-defense",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-defense",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       },
       {
        "id": "escape.side-control",
        "name": "Side control escape"
       },
       {
        "id": "escape.back",
        "name": "Back escape"
       },
       {
        "id": "def.submission-defense",
        "name": "Submission defense"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-pressure",
    "name": "Saved purple benchmark promo-pressure",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-pressure",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.mount",
        "name": "Mount"
       },
       {
        "id": "pos.side-control",
        "name": "Side control"
       },
       {
        "id": "pos.back-control",
        "name": "Back control"
       },
       {
        "id": "pos.knee-on-belly",
        "name": "Knee on belly"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-guard",
    "name": "Saved purple benchmark promo-guard",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-guard",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pos.open-guard",
        "name": "Open guard"
       },
       {
        "id": "pos.closed-guard",
        "name": "Closed guard"
       },
       {
        "id": "pos.half-guard",
        "name": "Half guard"
       },
       {
        "id": "def.guard-retention",
        "name": "Guard retention"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-pass",
    "name": "Saved purple benchmark promo-pass",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-pass",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "pass.torreando",
        "name": "Torreando pass"
       },
       {
        "id": "pass.knee-slice",
        "name": "Knee slice pass"
       },
       {
        "id": "pass.leg-drag",
        "name": "Leg drag"
       },
       {
        "id": "pass.stack",
        "name": "Stack pass"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-standing",
    "name": "Saved purple benchmark promo-standing",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-standing",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "td.double-leg",
        "name": "Double leg",
        "targetLevel": 4
       },
       {
        "id": "td.single-leg",
        "name": "Single leg",
        "targetLevel": 4
       },
       {
        "id": "td.arm-drag",
        "name": "Arm drag",
        "targetLevel": 4
       },
       {
        "id": "td.hip-throw",
        "name": "Hip throw",
        "targetLevel": 4
       },
       {
        "id": "def.sprawl",
        "name": "Sprawl",
        "targetLevel": 5
       }
      ],
      "met": null,
      "note": ""
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-finish",
    "name": "Saved purple benchmark promo-finish",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-finish",
      "requirement": "",
      "techniqueRefs": [
       {
        "id": "sub.armbar-guard",
        "name": "Armbar from guard"
       },
       {
        "id": "sub.triangle",
        "name": "Triangle"
       },
       {
        "id": "sub.kimura",
        "name": "Kimura"
       },
       {
        "id": "sub.guillotine",
        "name": "Guillotine"
       },
       {
        "id": "sub.rear-naked-choke",
        "name": "Rear naked choke"
       },
       {
        "id": "sub.cross-collar",
        "name": "Cross collar choke",
        "style": "gi"
       },
       {
        "id": "sub.straight-ankle-lock",
        "name": "Straight ankle lock"
       },
       {
        "id": "sub.americana",
        "name": "Americana"
       },
       {
        "id": "sub.omoplata",
        "name": "Omoplata"
       },
       {
        "id": "sub.wrist-lock",
        "name": "Wrist lock"
       }
      ],
      "met": null,
      "note": "",
      "targetLevel": 5
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-teach",
    "name": "Saved purple benchmark promo-teach",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.purple.promo-teach",
      "requirement": "",
      "techniqueRefs": [],
      "met": null,
      "note": "",
      "catalogNeed": {
       "count": 5,
       "level": 5
      }
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-consistency",
    "name": "Saved purple benchmark promo-consistency",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.purple.promo-rules",
    "name": "Saved purple benchmark promo-rules",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion",
    "rulebook": true
   }
  ]
 },
 {
  "id": "level.brown",
  "name": "Brown",
  "belt": "brown",
  "starterAck": true,
  "checkpoints": [
   {
    "id": "checkpoint.brown.s1-game",
    "name": "Saved brown benchmark s1-game",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.brown.s1-gaps",
    "name": "Saved brown benchmark s1-gaps",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.brown.s1-purpose",
    "name": "Saved brown benchmark s1-purpose",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.brown.s1-focus",
    "name": "Saved brown benchmark s1-focus",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-1"
   },
   {
    "id": "checkpoint.brown.s2-flow",
    "name": "Saved brown benchmark s2-flow",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.brown.s2-finishes",
    "name": "Saved brown benchmark s2-finishes",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.brown.s2-finishes",
      "requirement": "",
      "techniqueRefs": [],
      "met": null,
      "note": "",
      "catalogNeed": {
       "count": 1,
       "level": 5,
       "categoryId": "submissions"
      }
     }
    ],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.brown.s2-timing",
    "name": "Saved brown benchmark s2-timing",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.brown.s2-focus",
    "name": "Saved brown benchmark s2-focus",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-2"
   },
   {
    "id": "checkpoint.brown.s3-partners",
    "name": "Saved brown benchmark s3-partners",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.brown.s3-rulesets",
    "name": "Saved brown benchmark s3-rulesets",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.brown.s3-leglock",
    "name": "Saved brown benchmark s3-leglock",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3",
    "noGiVariant": "No-gi version of saved benchmark s3-leglock.",
    "policy": "leg-lock"
   },
   {
    "id": "checkpoint.brown.s3-standing",
    "name": "Saved brown benchmark s3-standing",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.brown.s3-competition",
    "name": "Saved brown benchmark s3-competition",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3",
    "policy": "competition",
    "optional": true
   },
   {
    "id": "checkpoint.brown.s3-focus",
    "name": "Saved brown benchmark s3-focus",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-3"
   },
   {
    "id": "checkpoint.brown.s4-teach",
    "name": "Saved brown benchmark s4-teach",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.brown.s4-teach",
      "requirement": "",
      "techniqueRefs": [],
      "met": null,
      "note": "",
      "catalogNeed": {
       "count": 3,
       "level": 5
      }
     }
    ],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.brown.s4-help",
    "name": "Saved brown benchmark s4-help",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.brown.s4-calm",
    "name": "Saved brown benchmark s4-calm",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.brown.s4-review",
    "name": "Saved brown benchmark s4-review",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.brown.s4-focus",
    "name": "Saved brown benchmark s4-focus",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "stripe-4"
   },
   {
    "id": "checkpoint.brown.promo-explain",
    "name": "Saved brown benchmark promo-explain",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.brown.promo-flow",
    "name": "Saved brown benchmark promo-flow",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.brown.promo-finishes",
    "name": "Saved brown benchmark promo-finishes",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.brown.promo-teach",
    "name": "Saved brown benchmark promo-teach",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.brown.promo-teach",
      "requirement": "",
      "techniqueRefs": [],
      "met": null,
      "note": "",
      "catalogNeed": {
       "count": 5,
       "level": 5
      }
     }
    ],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.brown.promo-lead",
    "name": "Saved brown benchmark promo-lead",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.brown.promo-adapt",
    "name": "Saved brown benchmark promo-adapt",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   },
   {
    "id": "checkpoint.brown.promo-rules",
    "name": "Saved brown benchmark promo-rules",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion",
    "rulebook": true
   },
   {
    "id": "checkpoint.brown.promo-focus",
    "name": "Saved brown benchmark promo-focus",
    "met": null,
    "note": "",
    "criteria": [],
    "stage": "promotion"
   }
  ]
 },
 {
  "id": "level.grey",
  "name": "Grey",
  "belt": "grey",
  "checkpoints": [
   {
    "id": "checkpoint.grey.positions",
    "name": "Saved grey benchmark positions",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.grey.closed-guard",
      "requirement": "Saved requirement closed-guard",
      "techniqueRefs": [
       {
        "id": "pos.closed-guard",
        "name": "Closed guard"
       }
      ],
      "met": null,
      "note": ""
     },
     {
      "id": "rubric.grey.mount",
      "requirement": "Saved requirement mount",
      "techniqueRefs": [
       {
        "id": "pos.mount",
        "name": "Mount"
       }
      ],
      "met": null,
      "note": ""
     }
    ]
   }
  ]
 },
 {
  "id": "level.yellow",
  "name": "Yellow",
  "belt": "yellow",
  "checkpoints": [
   {
    "id": "checkpoint.yellow.sweeps",
    "name": "Saved yellow benchmark sweeps",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.yellow.hip-bump",
      "requirement": "Saved requirement hip-bump",
      "techniqueRefs": [
       {
        "id": "sweep.hip-bump",
        "name": "Hip bump sweep"
       }
      ],
      "met": null,
      "note": ""
     },
     {
      "id": "rubric.yellow.pendulum",
      "requirement": "Saved requirement pendulum",
      "techniqueRefs": [
       {
        "id": "sweep.pendulum",
        "name": "Pendulum sweep"
       }
      ],
      "met": null,
      "note": ""
     }
    ]
   }
  ]
 },
 {
  "id": "level.orange",
  "name": "Orange",
  "belt": "orange",
  "checkpoints": [
   {
    "id": "checkpoint.orange.escapes",
    "name": "Saved orange benchmark escapes",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.orange.mount-escape",
      "requirement": "Saved requirement mount-escape",
      "techniqueRefs": [
       {
        "id": "escape.mount",
        "name": "Mount escape"
       }
      ],
      "met": null,
      "note": ""
     },
     {
      "id": "rubric.orange.headlock",
      "requirement": "Saved requirement headlock",
      "techniqueRefs": [
       {
        "id": "escape.headlock",
        "name": "Headlock escape"
       }
      ],
      "met": null,
      "note": ""
     }
    ]
   }
  ]
 },
 {
  "id": "level.green",
  "name": "Green",
  "belt": "green",
  "checkpoints": [
   {
    "id": "checkpoint.green.takedowns",
    "name": "Saved green benchmark takedowns",
    "met": null,
    "note": "",
    "criteria": [
     {
      "id": "rubric.green.double-leg",
      "requirement": "Saved requirement double-leg",
      "techniqueRefs": [
       {
        "id": "td.double-leg",
        "name": "Double leg"
       }
      ],
      "met": null,
      "note": ""
     },
     {
      "id": "rubric.green.single-leg",
      "requirement": "Saved requirement single-leg",
      "techniqueRefs": [
       {
        "id": "td.single-leg",
        "name": "Single leg"
       }
      ],
      "met": null,
      "note": ""
     }
    ]
   }
  ]
 }
] as unknown as RubricLevel[];

/** A file that already holds the rows an older build saved. Existing levels with the same id are replaced. */
export function withLegacySavedRubric(report: StudentProgressReport): StudentProgressReport {
  const saved = structuredClone(LEGACY_SAVED_LEVELS);
  const ids = new Set(saved.map((level) => level.id));
  return {
    ...report,
    rubric: { ...report.rubric, levels: [...report.rubric.levels.filter((level) => !ids.has(level.id)), ...saved] },
  };
}

export function legacySavedLevels(): RubricLevel[] {
  return structuredClone(LEGACY_SAVED_LEVELS);
}
