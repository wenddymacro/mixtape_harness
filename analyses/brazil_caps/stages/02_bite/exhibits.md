# 02_bite — exhibits

Figures produced by this stage's canister (`scripts/r/00_bite_inspect.R`,
`scripts/r/01_bite_national_trends.R`, `scripts/r/02_bite_maps.R`).

| Exhibit | File | What it shows | Producer |
|---|---|---|---|
| National admission trends | `output/figures/brazil_caps_bite.png` | Population-weighted psychiatric admissions per 10,000, 2002–2016, all mental disorders and the schizophrenia subset | `scripts/r/01_bite_national_trends.R` |
| State first difference, schizophrenia | `output/figures/brazil_caps_firstdiff_schiz.png` | Within-municipality change in schizophrenia admissions after adoption, population-weighted to each state | `scripts/r/02_bite_maps.R` |
| State first difference, all mental disorders | `output/figures/brazil_caps_firstdiff_allmh.png` | Same construction, all mental-disorder admissions | `scripts/r/02_bite_maps.R` |

Sample: 5,476 municipalities, 82,140 municipality-years, 2002–2016 (Dias & Fontes 2024
replication panel; sealed at `data/raw/brazil.dta`, SHA-256
`a90429b8d135050afdd6d51cccec5d4a2ba81f5096c5989de0d2f75b88f290c5`).
