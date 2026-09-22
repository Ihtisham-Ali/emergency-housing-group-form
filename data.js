/* data.js — Issue types and troubleshooting definitions */

const ISSUE_GROUPS = [
  {
    group: "Heating, Hot Water & Gas",
    issues: [
      { code: "RC-001R", label: "No heating", suffix: "RC-001R", urgent: true },
      { code: "RC-002A", label: "Heating intermittent", suffix: "RC-002A" },
      { code: "RC-003A", label: "Radiator(s) not heating properly", suffix: "RC-003A" },
      { code: "RC-004A", label: "Radiator leaking", suffix: "RC-004A" },
      { code: "RC-005G", label: "Radiator loose / damaged", suffix: "RC-005G" },
      { code: "RC-006R", label: "Boiler not working", suffix: "RC-006R", urgent: true },
      { code: "RC-007A", label: "Boiler pressure issue", suffix: "RC-007A" },
      { code: "RC-008R", label: "Boiler leaking", suffix: "RC-008R", urgent: true },
      { code: "RC-009R", label: "No hot water", suffix: "RC-009R", urgent: true },
      { code: "RC-010A", label: "Hot water intermittent", suffix: "RC-010A" },
      { code: "RC-011A", label: "Thermostat not working (Boiler)", suffix: "RC-011A" },
      { code: "RC-012R", label: "Gas smell", suffix: "RC-012R", urgent: true, emergency: true },
      { code: "RC-013A", label: "Gas appliance not working", suffix: "RC-013A" },
      { code: "RC-014R", label: "Carbon monoxide alarm issue", suffix: "RC-014R", urgent: true, emergency: true },
    ]
  },
  {
    group: "Plumbing, Water & Drainage",
    issues: [
      { code: "RC-020R", label: "Severe water leak / flooding", suffix: "RC-020R", urgent: true },
      { code: "RC-021A", label: "Suspected water leak", suffix: "RC-021A" },
      { code: "RC-022A", label: "Low water pressure", suffix: "RC-022A" },
      { code: "RC-023R", label: "No water supply", suffix: "RC-023R", urgent: true },
      { code: "RC-024A", label: "Leaking / broken tap", suffix: "RC-024A" },
      { code: "RC-025A", label: "Sink blocked", suffix: "RC-025A" },
      { code: "RC-026A", label: "Bath issue", suffix: "RC-026A" },
      { code: "RC-027A", label: "Shower not working", suffix: "RC-027A" },
      { code: "RC-028A", label: "Shower leaking", suffix: "RC-028A" },
      { code: "RC-029R", label: "Toilet not flushing / not working", suffix: "RC-029R", urgent: true },
      { code: "RC-030A", label: "Toilet blocked", suffix: "RC-030A" },
      { code: "RC-031A", label: "Toilet leaking", suffix: "RC-031A" },
      { code: "RC-032A", label: "Drain blocked (internal)", suffix: "RC-032A" },
      { code: "RC-033A", label: "Drain blocked (external)", suffix: "RC-033A" },
    ]
  },
  {
    group: "Electrics & Lighting",
    issues: [
      { code: "RC-040R", label: "No electricity to entire property", suffix: "RC-040R", urgent: true },
      { code: "RC-041A", label: "Partial loss of power", suffix: "RC-041A" },
      { code: "RC-042A", label: "Fuse box tripping", suffix: "RC-042A" },
      { code: "RC-043A", label: "Electric socket not working", suffix: "RC-043A" },
      { code: "RC-044A", label: "Light not working", suffix: "RC-044A" },
      { code: "RC-045A", label: "Light switch not working", suffix: "RC-045A" },
      { code: "RC-046G", label: "Light fitting damaged", suffix: "RC-046G" },
      { code: "RC-047R", label: "Exposed wiring", suffix: "RC-047R", urgent: true },
      { code: "RC-048R", label: "Fire alarm issue", suffix: "RC-048R", urgent: true },
      { code: "RC-049R", label: "Heat detector issue", suffix: "RC-049R", urgent: true },
    ]
  },
  {
    group: "Doors, Windows & Security",
    issues: [
      { code: "RC-060A", label: "Door not closing", suffix: "RC-060A" },
      { code: "RC-061R", label: "Door lock broken", suffix: "RC-061R", urgent: true },
      { code: "RC-062A", label: "Door handle broken", suffix: "RC-062A" },
      { code: "RC-063A", label: "Internal door damaged", suffix: "RC-063A" },
      { code: "RC-064R", label: "External door damaged", suffix: "RC-064R", urgent: true },
      { code: "RC-065R", label: "Fire door issue", suffix: "RC-065R", urgent: true },
      { code: "RC-066A", label: "Window not opening", suffix: "RC-066A" },
      { code: "RC-067A", label: "Window not closing", suffix: "RC-067A" },
      { code: "RC-068A", label: "Window handle / lock issue", suffix: "RC-068A" },
      { code: "RC-069R", label: "Broken glass", suffix: "RC-069R", urgent: true },
    ]
  },
  {
    group: "Kitchen & Appliances (Supplied Items Only)",
    issues: [
      { code: "RC-080G", label: "Cooker not working", suffix: "RC-080G" },
      { code: "RC-081G", label: "Oven not working", suffix: "RC-081G" },
      { code: "RC-082G", label: "Hob not working", suffix: "RC-082G" },
      { code: "RC-083G", label: "Extractor fan not working", suffix: "RC-083G" },
      { code: "RC-084G", label: "Fridge not working", suffix: "RC-084G" },
      { code: "RC-085G", label: "Freezer not working", suffix: "RC-085G" },
      { code: "RC-086G", label: "Washing machine not working", suffix: "RC-086G" },
    ]
  },
  {
    group: "Floors, Walls & Internal Fixtures",
    issues: [
      { code: "RC-100G", label: "Flooring damaged", suffix: "RC-100G" },
      { code: "RC-101G", label: "Carpet damaged", suffix: "RC-101G" },
      { code: "RC-102G", label: "Lino damaged", suffix: "RC-102G" },
      { code: "RC-103G", label: "Floor tiles damaged", suffix: "RC-103G" },
      { code: "RC-104G", label: "Wall tiles damaged", suffix: "RC-104G" },
      { code: "RC-105G", label: "Ceiling damage", suffix: "RC-105G" },
      { code: "RC-106G", label: "Wall cracks / plaster damage", suffix: "RC-106G" },
      { code: "RC-108G", label: "Skirting / trims damaged", suffix: "RC-108G" },
    ]
  },
  {
    group: "Joinery & Fittings",
    issues: [
      { code: "RC-120G", label: "Kitchen units damaged", suffix: "RC-120G" },
      { code: "RC-121G", label: "Cupboards broken", suffix: "RC-121G" },
      { code: "RC-123G", label: "Shelves loose / broken", suffix: "RC-123G" },
      { code: "RC-124G", label: "Worktop damaged", suffix: "RC-124G" },
    ]
  },
  {
    group: "Damp, Mould & Air Quality",
    issues: [
      { code: "RC-140A", label: "Damp / mould / condensation", suffix: "RC-140A" },
      { code: "RC-143A", label: "Ventilation issue", suffix: "RC-143A" },
      { code: "RC-144A", label: "Extractor fan (ventilation-related)", suffix: "RC-144A" },
    ]
  },
  {
    group: "Pests & Waste",
    issues: [
      { code: "RC-160A", label: "Rats / mice", suffix: "RC-160A" },
      { code: "RC-162A", label: "Cockroaches", suffix: "RC-162A" },
      { code: "RC-163A", label: "Bed bugs", suffix: "RC-163A" },
      { code: "RC-164A", label: "Insects / wasps", suffix: "RC-164A" },
      { code: "RC-165A", label: "Rubbish removal", suffix: "RC-165A" },
    ]
  },
  {
    group: "External & Structural",
    issues: [
      { code: "RC-180A", label: "Roof issue", suffix: "RC-180A" },
      { code: "RC-181G", label: "Guttering issue", suffix: "RC-181G" },
      { code: "RC-182G", label: "Chimney issue", suffix: "RC-182G" },
      { code: "RC-183A", label: "External wall issue", suffix: "RC-183A" },
      { code: "RC-184G", label: "Fences / boundaries", suffix: "RC-184G" },
      { code: "RC-185G", label: "Garden issue", suffix: "RC-185G" },
      { code: "RC-186G", label: "Conservatory issue", suffix: "RC-186G" },
      { code: "RC-187R", label: "Stairs / handrails unsafe", suffix: "RC-187R", urgent: true },
    ]
  },
  {
    group: "Other",
    issues: [
      { code: "RC-999G", label: "Other issue (please describe)", suffix: "RC-999G" },
    ]
  }
];

/* Categorisation helpers */
const PEST_CODES = ["RC-160A","RC-162A","RC-163A","RC-164A","RC-165A"];
const HEATING_CODES = ["RC-001R","RC-002A","RC-003A","RC-006R","RC-007A","RC-009R","RC-010A","RC-011A"];
const ELECTRICAL_CODES = ["RC-040R","RC-041A","RC-042A","RC-043A","RC-044A","RC-045A","RC-046G","RC-047R"];
