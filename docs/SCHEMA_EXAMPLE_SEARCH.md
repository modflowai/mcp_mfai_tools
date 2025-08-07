# Search Examples Schema Analysis & Improvement Roadmap

This document provides a comprehensive analysis of the `flopy_workflows` and `pyemu_workflows` tables used by the search-examples tool, and outlines a roadmap for enhancing tutorial and workflow search capabilities.

## Current Status

✅ **Phase 0 COMPLETE**: Minimal search-examples tool deployed and working  
✅ **Phase 1.1 COMPLETE**: Display control options implemented and deployed  
✅ **Phase 1.2 COMPLETE**: Enhanced snippet display with ts_headline highlighting  
✅ **Phase 2.1 COMPLETE**: Filtering capabilities added, tested, and deployed  
✅ **Phase 3.1 COMPLETE**: Rich array search within array fields implemented and deployed  
✅ **FEATURE COMPLETE**: Full production deployment with all text search features  
📊 **TESTED**: 20+ comprehensive test cases all passing  
🎯 **SEMANTIC SEARCH**: Handled by separate dedicated `semantic_search_examples` tool

### What's Implemented (Phase 0 + Phase 1.1 + Phase 1.2 + Phase 2.1 + Phase 3.1)
- Basic text search using `search_vector` and `plainto_tsquery`
- Repository filtering (flopy, pyemu, or both)
- Returns: title, description, complexity, model_type/workflow_type, packages
- Relevance ranking with `ts_rank_cd`
- Clean error handling and debug output
- Limit parameter (1-50 results)
- **Phase 1.1**: User-controlled display options:
  - `include_use_cases`: Show best_use_cases/common_applications
  - `include_prerequisites`: Show prerequisites
  - `include_modifications`: Show common_modifications (FloPy only)
  - `include_tips`: Show implementation_tips/best_practices (PyEMU only)
  - `include_purpose`: Show full workflow_purpose
  - `include_tags`: Show tags
  - `compact_arrays`: Show only first 2 items of arrays
- **Phase 1.2**: Enhanced snippet display:
  - `include_snippet`: Show highlighted search snippets using ts_headline
  - `snippet_length`: Control snippet length (50-500 characters)  
  - `snippet_source`: Choose snippet source (description/purpose/both)
- **Phase 2.1**: Advanced filtering capabilities:
  - `model_type`: Filter by model type (mf6, mf6-gwf, mf2005, etc.)
  - `packages`: Filter by packages used (array)
  - `has_packages`: Match any or all packages (default: any)
  - `complexity`: Filter by complexity level
  - `workflow_type`: Filter by PyEMU workflow type
  - `pest_concepts`: Filter by PEST concepts (PyEMU only)
  - `uncertainty_methods`: Filter by uncertainty methods (PyEMU only)
- **Phase 3.1**: Rich array search capabilities:
  - `search_arrays`: Enable searching within array fields
  - `array_fields`: Specify which arrays to search (use_cases, prerequisites, modifications, tips, practices)
  - `search_mode`: Prioritization mode (title_first, arrays_first, balanced)
  - Dynamic SQL with unnest to search within best_use_cases, prerequisites, common_modifications, etc.

## Database Schema Analysis

### Overview Statistics

| Table | Records | Data Size | Index Size | Total Size |
|-------|---------|-----------|------------|------------|
| **flopy_workflows** | 145 | 400 kB | 7,368 kB | 7,768 kB |
| **pyemu_workflows** | 13 | 80 kB | 8,464 kB | 8,544 kB |

**Total Coverage**: 158 tutorials and workflows across FloPy and PyEMU

### FloPy Workflows Table (`flopy_workflows`)

**Purpose**: Stores FloPy tutorials, examples, and complete groundwater modeling workflows

#### Core Fields
```sql
-- Identity & Location
id                    uuid         -- Primary key
tutorial_file        text         -- File path (e.g., "examples/ex-gwf-drn.py")
github_url           text         -- Direct GitHub link

-- Tutorial Metadata
title                text         -- Tutorial title
description          text         -- Brief description
model_type           text         -- Model type (mf6, mf6-gwf, mf6-coupled, mf2005, mt3d, etc.)
complexity           text         -- Difficulty level (beginner, simple, intermediate, advanced)

-- Technical Details
packages_used        text[]       -- MODFLOW packages used (e.g., ["DIS", "IC", "NPF", "WEL"])
modules_used         text[]       -- FloPy modules referenced
num_steps            integer      -- Number of workflow steps
total_lines          integer      -- Lines of code

-- Rich Arrays (High-Value Content)
best_use_cases       text[]       -- Real-world application scenarios
prerequisites        text[]       -- Required knowledge/skills
common_modifications text[]       -- How users typically adapt this workflow
tags                 text[]       -- Searchable tags

-- AI-Enhanced Content
workflow_purpose     text         -- Comprehensive purpose and objectives
embedding_text       text         -- Text used for embeddings
embedding            vector       -- Semantic embeddings (1536 dimensions)

-- Search Infrastructure  
search_vector        tsvector     -- PostgreSQL full-text search
file_hash           text         -- Content hash for change detection
processed_at        timestamp    -- Last processing time
source_code         text         -- Complete source code
source_repository   text         -- Repository source (default: 'flopy')
```

#### Model Type Distribution
```
mf6-gwf:     44 workflows (30%)  -- MODFLOW 6 Groundwater Flow
mf6-coupled: 29 workflows (20%)  -- Coupled models (GWF-GWT)
mf6:         28 workflows (19%)  -- General MODFLOW 6
unknown:     24 workflows (17%)  -- Legacy/misc models
mf2005:      14 workflows (10%)  -- MODFLOW-2005
mt3d:         3 workflows (2%)   -- MT3D transport
mfnwt:        2 workflows (1%)   -- MODFLOW-NWT
modpath:      1 workflow  (1%)   -- MODPATH particle tracking
```

#### Complexity Distribution
```
intermediate: 58 workflows (40%)
advanced:     37 workflows (26%)
beginner:     36 workflows (25%)
simple:       14 workflows (10%)
```

#### Available Indexes
- `flopy_workflows_pkey` (16 kB) - Primary key on id
- `flopy_workflows_tutorial_file_key` (32 kB) - Unique constraint on file path
- `idx_flopy_workflows_model_type` (16 kB) - Fast model type filtering
- `idx_flopy_workflows_complexity` (16 kB) - Complexity level filtering  
- `idx_flopy_workflows_tags` (40 kB) - GIN index for tag searches
- `idx_flopy_workflows_packages` (40 kB) - GIN index for package searches
- `idx_flopy_workflows_embedding` (3,720 kB) - IVFFlat index for vector search
- `idx_flopy_workflows_search_vector` (312 kB) - GIN index for text search

#### Sample Rich Metadata

**Example 1: Time Array Series Tutorial**
```yaml
title: "MODFLOW 6: Time Array Series Packages"
complexity: simple
model_type: mf6
packages_used: [DIS, IC, IMS, NPF, TDIS]

best_use_cases:
  - "Modeling Land Use-Based Recharge: In a watershed with distinct land uses..."
  - "Simulating Climate Change Impacts: A hydrologist can create several time series..."

prerequisites:
  - "Time-Series Data: The user must possess core input for the TAS package..."
  - "Basic MODFLOW and FloPy Knowledge: Understanding of stress periods, time steps..."

common_modifications:
  - "Applying TAS to Other Packages: Apply same logic to WEL, EVT, RIV, GHB..."
  - "Integrating External Data: Read data from CSV, Excel, or netCDF files..."

workflow_purpose: "Demonstrate how to construct a transient groundwater model in MODFLOW 6 
                  that uses Time Array Series (TAS) functionality for efficient time-varying 
                  boundary conditions..."
```

### PyEMU Workflows Table (`pyemu_workflows`)

**Purpose**: Stores PyEMU uncertainty analysis tutorials and PEST workflow examples

#### Core Fields
```sql
-- Identity & Location
id                     uuid         -- Primary key
notebook_file         text         -- Jupyter notebook path
github_url            text         -- Direct GitHub link

-- Tutorial Metadata
title                 text         -- Tutorial title
description           text         -- Brief description
workflow_type         text         -- Type of analysis workflow
complexity            text         -- Difficulty level

-- Technical Details
pest_concepts         text[]       -- PEST concepts covered (e.g., ["regularization", "parameter"])
uncertainty_methods   text[]       -- Uncertainty methods used (e.g., ["FOSM", "Schur"])
pyemu_modules         text[]       -- PyEMU modules used
num_sections          integer      -- Number of notebook sections
total_cells           integer      -- Total notebook cells
code_cells            integer      -- Number of code cells

-- Rich Arrays (High-Value Content)
prerequisites         text[]       -- Required knowledge
best_practices        text[]       -- Recommended practices
common_applications   text[]       -- Typical use cases
implementation_tips   text[]       -- Practical tips
tags                  text[]       -- Searchable tags

-- AI-Enhanced Content
workflow_purpose      text         -- Comprehensive purpose
embedding_text        text         -- Text for embeddings
embedding             vector       -- Semantic embeddings

-- Search Infrastructure
search_vector         tsvector     -- PostgreSQL full-text search
file_hash            text         -- Content hash
processed_at         timestamp    -- Last processing time
source_code          text         -- Complete notebook code
```

#### Workflow Type Distribution
```
schur_complement:      3 workflows  -- Schur's complement analysis
uncertainty_analysis:  3 workflows  -- General uncertainty analysis
error_variance:        2 workflows  -- Error variance analysis
pest_setup:           2 workflows  -- PEST setup and configuration
covariance_analysis:  1 workflow   -- Covariance matrix analysis
ensemble_analysis:    1 workflow   -- Ensemble methods
optimization:         1 workflow   -- Optimization workflows
```

#### Sample Rich Metadata

**Example: Schur's Complement Workflow**
```yaml
title: "First-Order Second-Moment Analysis with Schur's Complement"
workflow_type: schur_complement
complexity: beginner
pest_concepts: [calibration, parameter, pest]
uncertainty_methods: [Schur]

workflow_purpose: "Accomplish First-Order, Second-Moment (FOSM) linear uncertainty analysis 
                  for model forecasts using Schur's Complement method. Efficiently quantify 
                  how uncertainty in calibrated parameters propagates to predictions..."

best_practices:
  - "Always validate Jacobian matrix before analysis"
  - "Check parameter sensitivities for numerical stability"

common_applications:
  - "Forecast uncertainty after calibration"
  - "Parameter contribution to prediction uncertainty"
```

## Current Implementation Analysis

### Phase 0 - Minimal Tool ✅ COMPLETE
**File**: `src/tools/search-examples.ts`
- Clean, simple implementation (~150 lines)
- Basic text search with relevance ranking
- Repository filtering (flopy/pyemu)
- Returns essential metadata
- Proper error handling
- Debug information

### What's NOT Yet Implemented (Opportunities)
- **Rich array search** - Searching within array field contents (best_use_cases, prerequisites, etc.)
- **Enhanced snippets** - Better snippet highlighting with ts_headline configuration
- **Vector search** - Embeddings exist but not yet utilized for semantic search
- **Hybrid search** - Combining text and vector search with weighted scoring
- **Learning paths** - Suggesting tutorial progression based on prerequisites
- **Coverage analysis** - Package/concept coverage statistics
- **Advanced aggregations** - Summary views of available tutorials by category

## Improvement Roadmap: User-Controlled Features

**PRINCIPLE**: User-controlled search with explicit parameters, no hardcoding

### Phase 0: Minimal Working Tool ✅ COMPLETE
**Status**: Deployed and tested
**Implementation**: `src/tools/search-examples.ts`

**What was done**:
- Created clean, minimal implementation replacing complex original
- Basic text search with `search_vector` and `plainto_tsquery`
- Repository filtering working
- Essential metadata display (title, complexity, packages)
- Proper SQL syntax with `sql.query()`
- Comprehensive testing completed

**Test Results**:
- ✅ PyEMU-specific search (uncertainty analysis)
- ✅ Package-specific search (WEL package)
- ✅ Complex queries (coupled groundwater transport)
- ✅ No results handling
- ✅ Invalid repository error handling

### Phase 1: Enhanced Display Options ✅ COMPLETE

#### Step 1.1: Rich Array Display Control ✅ DEPLOYED
**What**: Let users control which rich arrays to display  
**Risk**: Zero - additive display options only  
**Status**: Implemented and deployed to production  
**Implementation**:
```typescript
// New optional parameters
include_use_cases: boolean       // Show best_use_cases/common_applications
include_prerequisites: boolean   // Show prerequisites
include_modifications: boolean   // Show common_modifications
include_tips: boolean           // Show implementation_tips/best_practices
include_purpose: boolean        // Show workflow_purpose (can be long)
include_source: boolean         // Show source_code snippets
compact_arrays: boolean         // Compact array display (first 2 items)
```

**Query Example**:
```typescript
mcp__mfaitools__search_examples({
  query: "recharge tutorial",
  include_use_cases: true,
  include_prerequisites: true,
  compact_arrays: true
})
```

#### Step 1.2: Enhanced Snippet Display
**What**: Better snippet highlighting and control  
**Risk**: Zero - display enhancement only  
**Implementation**:
```typescript
include_snippet: boolean        // Show highlighted snippets
snippet_length: number          // Max snippet length (50-500)
snippet_source: 'description' | 'purpose' | 'both'  // Which field to snippet
```

### Phase 2: Advanced Filtering ✅ COMPLETE

#### Step 2.1: Model and Package Filtering ✅ DEPLOYED
**What**: Filter by model type and packages  
**Risk**: Low - uses existing indexes  
**Status**: Implemented and deployed to production  
**Implementation**:
```typescript
// FloPy-specific filters
model_type: string              // Filter by model (mf6, mf6-gwf, mf2005, etc.)
packages: string[]              // Filter by packages used (WEL, DIS, etc.)
has_packages: 'any' | 'all'    // Match any or all specified packages

// PyEMU-specific filters  
workflow_type: string           // Filter by workflow type
pest_concepts: string[]        // Filter by PEST concepts covered
uncertainty_methods: string[]   // Filter by uncertainty methods
```

**Query Examples**:
```typescript
// Find MODFLOW 6 tutorials using wells
mcp__mfaitools__search_examples({
  query: "pumping",
  model_type: "mf6",
  packages: ["WEL"],
  repository: "flopy"
})

// Find uncertainty analysis tutorials
mcp__mfaitools__search_examples({
  query: "forecast",
  workflow_type: "uncertainty_analysis",
  repository: "pyemu"
})
```

#### Step 2.2: Complexity and Size Filtering
**What**: Filter by tutorial complexity and size  
**Risk**: Low - simple WHERE clauses  
**Implementation**:
```typescript
complexity: 'beginner' | 'simple' | 'intermediate' | 'advanced'
min_steps: number              // Minimum workflow steps
max_steps: number              // Maximum workflow steps
min_cells: number              // For notebooks: minimum cells
max_cells: number              // For notebooks: maximum cells
```

### Phase 3: Field-Specific Search (MEDIUM RISK - Query Changes)

#### Step 3.1: Rich Array Search
**What**: Search within array fields for specific content  
**Risk**: Medium - requires dynamic SQL generation  
**Implementation**:
```typescript
search_arrays: boolean          // Include arrays in search
array_fields: string[]         // Specific arrays to search
search_mode: 'title_first' | 'arrays_first' | 'balanced'
```

**SQL Implementation**:
```sql
-- Dynamic array search
WHERE (
  -- Standard search
  search_vector @@ to_tsquery('english', $1)
  -- Array search (when enabled)
  OR EXISTS (
    SELECT 1 FROM unnest(best_use_cases) AS use_case 
    WHERE use_case ILIKE '%' || $1 || '%'
  )
  OR EXISTS (
    SELECT 1 FROM unnest(prerequisites) AS prereq
    WHERE prereq ILIKE '%' || $1 || '%'
  )
)
```

#### Step 3.2: Combined Text and Vector Search
**What**: Hybrid search using both text and embeddings  
**Risk**: Medium - requires embedding generation  
**Implementation**:
```typescript
search_method: 'text' | 'semantic' | 'hybrid'
semantic_weight: number        // Weight for semantic scores (0-1)
text_weight: number           // Weight for text scores (0-1)
```

### Phase 4: Smart Features (MEDIUM RISK - Advanced Logic)

#### Step 4.1: Workflow Progression
**What**: Find tutorials in learning order  
**Risk**: Medium - requires relationship mapping  
**Implementation**:
```typescript
learning_path: boolean         // Order by learning progression
next_tutorials: boolean        // Suggest next tutorials
prerequisite_check: boolean   // Show prerequisite status
```

#### Step 4.2: Package Coverage Analysis
**What**: Show which packages are covered  
**Risk**: Medium - aggregation queries  
**Implementation**:
```typescript
show_coverage: boolean         // Show package coverage stats
coverage_summary: boolean      // Summary of topics covered
gap_analysis: boolean         // Show what's not covered
```

## Implementation Strategy

### Updated Schema
```typescript
export const searchExamplesSchema = {
  name: "search_examples",
  description: "Search tutorials and workflows with rich filtering and display options",
  inputSchema: {
    type: 'object',
    properties: {
      // Core parameters
      query: {
        type: 'string',
        description: 'Search query for tutorials'
      },
      repository: {
        type: 'string',
        description: 'Repository: flopy, pyemu'
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-50, default: 10)'
      },
      
      // Phase 1: Display options
      include_use_cases: {
        type: 'boolean',
        description: 'Include use cases and applications'
      },
      include_prerequisites: {
        type: 'boolean',
        description: 'Include prerequisites'
      },
      include_modifications: {
        type: 'boolean',
        description: 'Include common modifications'
      },
      include_tips: {
        type: 'boolean',
        description: 'Include implementation tips'
      },
      include_purpose: {
        type: 'boolean',
        description: 'Include full workflow purpose'
      },
      include_source: {
        type: 'boolean',
        description: 'Include source code'
      },
      include_snippet: {
        type: 'boolean',
        description: 'Include highlighted snippets'
      },
      compact_arrays: {
        type: 'boolean',
        description: 'Show only first 2 array items'
      },
      
      // Phase 2: Filters
      complexity: {
        type: 'string',
        enum: ['beginner', 'simple', 'intermediate', 'advanced'],
        description: 'Filter by complexity'
      },
      model_type: {
        type: 'string',
        description: 'Filter by model type (mf6, mf2005, etc.)'
      },
      workflow_type: {
        type: 'string',
        description: 'Filter by workflow type (PyEMU)'
      },
      packages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by packages used'
      },
      
      // Phase 3: Advanced search
      search_arrays: {
        type: 'boolean',
        description: 'Search within array fields'
      },
      search_method: {
        type: 'string',
        enum: ['text', 'semantic', 'hybrid'],
        description: 'Search method to use'
      }
    },
    required: ['query']
  }
};
```

### Testing Strategy

1. **Display Options Testing**
   - Verify each include_* flag works independently
   - Test compact_arrays truncation
   - Ensure backward compatibility

2. **Filter Testing**
   - Test each filter independently
   - Test filter combinations
   - Verify empty result handling

3. **Performance Testing**
   - Measure response times with various options
   - Test with maximum array display
   - Verify index usage

### Success Metrics

- **User Control**: Users can find exactly the tutorials they need
- **Performance**: Response time < 2 seconds for all queries
- **Relevance**: Improved result quality with filtering
- **Discoverability**: Clear parameter documentation

## Query Examples

### Find Beginner MODFLOW 6 Tutorials
```typescript
mcp__mfaitools__search_examples({
  query: "groundwater flow",
  repository: "flopy",
  model_type: "mf6",
  complexity: "beginner",
  include_prerequisites: true,
  include_use_cases: true
})
```

### Find Uncertainty Analysis with Specific Methods
```typescript
mcp__mfaitools__search_examples({
  query: "parameter uncertainty",
  repository: "pyemu",
  workflow_type: "uncertainty_analysis",
  uncertainty_methods: ["FOSM"],
  include_tips: true
})
```

### Find Tutorials Using Specific Packages
```typescript
mcp__mfaitools__search_examples({
  query: "river boundary",
  packages: ["RIV", "DRN"],
  include_modifications: true,
  compact_arrays: true
})
```

## Progress Checklist

### ✅ Completed Phases
- [x] **Phase 0**: Create minimal tool (COMPLETE)
  - [x] Basic text search with relevance ranking
  - [x] Repository filtering
  - [x] Clean error handling
  - [x] Deployed and tested

- [x] **Phase 1.1**: Display control options (COMPLETE)
  - [x] `include_use_cases` parameter
  - [x] `include_prerequisites` parameter
  - [x] `include_modifications` parameter (FloPy only)
  - [x] `include_tips` parameter (PyEMU only)
  - [x] `include_purpose` parameter
  - [x] `include_tags` parameter
  - [x] `compact_arrays` parameter
  - [x] Deployed and tested

- [x] **Phase 1.2**: Enhanced snippet display (COMPLETE)
  - [x] `include_snippet` parameter
  - [x] `snippet_length` control (50-500 chars)
  - [x] `snippet_source` selection (description/purpose/both)
  - [x] ts_headline implementation with highlighted search terms
  - [x] <mark> tag highlighting for search matches
  - [x] Deployed and tested (3+ snippet test cases)

- [x] **Phase 2.1**: Filtering capabilities (COMPLETE)
  - [x] `model_type` filter (mf6, mf6-gwf, mf2005, etc.)
  - [x] `packages` array filter with ANY/ALL logic
  - [x] `complexity` filter (beginner, simple, intermediate, advanced)
  - [x] `workflow_type` filter (PyEMU)
  - [x] `pest_concepts` filter (PyEMU)
  - [x] `uncertainty_methods` filter (PyEMU)
  - [x] Fixed MCP array parameter parsing issue
  - [x] Comprehensive testing (10+ test cases)
  - [x] Deployed and working in production

- [x] **Phase 3.1**: Rich array search (COMPLETE)
  - [x] `search_arrays` parameter to enable array field search
  - [x] `array_fields` specification (use_cases, prerequisites, modifications, tips, practices)
  - [x] `search_mode` control (title_first, arrays_first, balanced)
  - [x] Dynamic SQL with unnest for array content search
  - [x] Field mapping for FloPy vs PyEMU array differences
  - [x] Repository-specific array field validation
  - [x] Comprehensive testing (7+ array search test cases)
  - [x] Deployed and working in production

### 🎯 Architecture Decision: Separate Tools

**Text Search**: The `search_examples` tool is **feature-complete** for keyword-based discovery
**Semantic Search**: The `semantic_search_examples` tool handles concept-based discovery  
**No Hybrid**: Dedicated tools serve specific search paradigms without cross-tool complexity

### 💡 Future Enhancements (Optional)

- [ ] **Smart features for text search**:
  - [ ] Learning path suggestions based on complexity progression
  - [ ] Package coverage analysis for workflow planning
  - [ ] Prerequisite checking for workflow readiness

### ✅ Project Status

The search-examples tool has successfully evolved from basic text search to a comprehensive tutorial discovery system with:
- **4 major phases completed** (0, 1.1, 1.2, 2.1, 3.1)
- **Advanced filtering** by model type, packages, complexity, and workflow type
- **Rich display options** with snippet highlighting and array content
- **Array field search** within use cases, prerequisites, and implementation details
- **Production stability** with extensive testing and error handling

This tool now provides powerful, user-controlled tutorial discovery while maintaining simplicity and performance for text-based searches.