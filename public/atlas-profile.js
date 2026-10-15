export default {
  "title": "EVALUATION CONSTELLATION",
  "headline": "From prompt to proof.",
  "tag": "Suites, evaluation cases, targets, and governed results.",
  "layout": "radial",
  "layers": [
    [
      "suites",
      "suites",
      "Suites"
    ],
    [
      "cases",
      "cases",
      "Test cases"
    ],
    [
      "targets",
      "targets",
      "Targets"
    ],
    [
      "runs",
      "runs",
      "Evaluations"
    ]
  ],
  "links": [
    [
      "cases",
      "suites",
      [
        "suite_id",
        "suite"
      ],
      [
        "id",
        "name"
      ]
    ],
    [
      "runs",
      "suites",
      [
        "suite_id",
        "suite"
      ],
      [
        "id",
        "name"
      ]
    ],
    [
      "runs",
      "targets",
      [
        "target_id",
        "target"
      ],
      [
        "id",
        "name"
      ]
    ]
  ]
};
