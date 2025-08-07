# Code Search Schema Analysis & Improvement Roadmap

This document analyzes the rich metadata available in the `flopy_modules` and `pyemu_modules` tables and provides a roadmap for incrementally improving the search-code tool with **USER-CONTROLLED** features.

## Current Status

✅ **WORKING**: Simple search-code tool using `search_vector` for text-based search across both tables  
📊 **GOAL**: Leverage rich metadata with user-controlled search strategies and filters

## Database Schema Analysis

### FloPy Modules Table (`flopy_modules`)

**Table Size**: 928 kB data, 12 MB indexes, 13 MB total

#### Core Metadata Fields
```sql
-- Identity & Location
id                  uuid         -- Primary key  
file_path          text         -- Full system path
relative_path      text         -- Repository-relative path
module_name        text         -- Python module name
github_url         text         -- Direct GitHub link

-- MODFLOW-specific Classification  
package_code       text         -- MODFLOW package codes (WEL, RCH, SMS, etc.)
model_family       text         -- Model types (mf6, mfusg, modflow, etc.)

-- Content & Documentation
module_docstring   text         -- Original Python docstring
source_code        text         -- Full Python source code
semantic_purpose   text         -- AI-generated comprehensive description

-- Rich Arrays (high-value metadata)
user_scenarios     text[]       -- Real-world usage examples with context
related_concepts   text[]       -- Connected packages/concepts with explanations  
typical_errors     text[]       -- Common mistakes and debugging info

-- Search Infrastructure
search_vector      tsvector     -- PostgreSQL full-text search index
embedding_text     text         -- Text used for embeddings
embedding          vector       -- Vector embeddings (not using)

-- Version Control
git_commit_hash    text         -- Source git commit
git_branch         text         -- Source git branch  
git_commit_date    timestamp    -- Commit timestamp
last_modified      timestamp    -- File modification time
processed_at       timestamp    -- Analysis timestamp
```

#### Available Indexes (Optimized for Search)
- `idx_flopy_modules_package_code` - Fast package code lookups
- `idx_flopy_modules_model_family` - Model family filtering  
- `idx_flopy_modules_search_vector` - Full-text search (GIN index)

#### Sample Rich Metadata

**Package Code**: `SMS` (Sparse Matrix Solver)
**User Scenarios**:
- "Scenario 1: Migrating a Legacy Model to an Unstructured Grid"  
- "Scenario 2: Modeling Unconfined Aquifers with Significant Wetting and Drying"

**Related Concepts**:
- "DISU Package: This is the most critical related package. The DISU (Unstructured Discretization) package defines the grid itself..."
- "UPW Package: The Upstream-Weighting (UPW) package is the more modern alternative to BCF..."

**Typical Errors**:
- "Error 1: Array Size Mismatch with `nodes`"
- "Error 2: Inconsistent `laycon` and Property Specification"

### PyEMU Modules Table (`pyemu_modules`) 

**Table Size**: 56 kB data, 2.8 MB indexes, 2.9 MB total

#### Core Metadata Fields
```sql
-- Identity & Location  
id                     uuid         -- Primary key
file_path             text         -- Full system path  
relative_path         text         -- Repository-relative path
module_name           text         -- Python module name
github_url            text         -- Direct GitHub link

-- PyEMU-specific Classification
category              text         -- Module categories (core, utils, etc.)

-- Content & Documentation
module_docstring      text         -- Original Python docstring
source_code           text         -- Full Python source code  
semantic_purpose      text         -- AI-generated comprehensive description

-- Rich Arrays (high-value metadata)
use_cases             text[]       -- Practical usage scenarios
pest_integration      text[]       -- PEST software integration details
statistical_concepts  text[]       -- Statistical/mathematical concepts
common_pitfalls       text[]       -- Common mistakes and warnings

-- Search Infrastructure
search_vector         tsvector     -- PostgreSQL full-text search index
embedding_text        text         -- Text used for embeddings
embedding             vector       -- Vector embeddings (not using)
```

#### Available Indexes  
- `idx_pyemu_modules_category` - Fast category filtering
- `idx_pyemu_modules_name` - Module name lookups
- `idx_pyemu_modules_search_vector` - Full-text search (GIN index)

#### Sample Rich Metadata

**Category**: `core`
**Use Cases**:
- "Scenario: A groundwater modeler has just finished a successful PEST calibration. They want to answer: 'How certain am I about my calibrated hydraulic conductivity values?'"

**PEST Integration**:
- "PEST File Integration (Inputs): LinearAnalysis is designed to consume the core output files from a PEST run"
- "PEST Control File (.pst): Loaded via __load_pst. This is the central definition file..."

**Statistical Concepts**:
- "Statistical Concept: First-Order, Second-Moment (FOSM)"
- "First-Order: The core assumption is that the model is locally linear..."

**Common Pitfalls**:
- "Pitfall: Assuming Linearity Holds"
- "Mistake: Users often accept FOSM-derived uncertainty estimates without question, even when their model is highly nonlinear"

## Current Implementation Status

### What We Currently Display
- ✅ Basic metadata: `module_name`, `package_code`, `model_family`, `category`
- ✅ `semantic_purpose` (truncated to 200 chars)  
- ✅ `relevance_score`

### What We're Missing (Rich Arrays)
- ❌ `user_scenarios` / `use_cases` - Real-world examples  
- ❌ `related_concepts` / `statistical_concepts` - Deep explanations
- ❌ `typical_errors` / `common_pitfalls` - Debugging help
- ❌ `pest_integration` - PEST software details
- ❌ Source code snippets
- ❌ GitHub URLs

## Improvement Roadmap: User-Controlled Features

**PRINCIPLE**: No hardcoding, no assumptions. User explicitly chooses search strategy and output options.

### Phase 1: Enhanced Display Options (SAFE - Zero Breaking Changes)

#### Step 1.1: Add Rich Array Output Options
**What**: Let user choose which rich metadata to display  
**Risk**: Zero - additive display options only  
**Implementation**:
```typescript
// New optional parameters
include_scenarios: boolean     // Show user_scenarios/use_cases
include_concepts: boolean      // Show related_concepts/statistical_concepts  
include_errors: boolean        // Show typical_errors/common_pitfalls
include_pest: boolean          // Show pest_integration
include_source: boolean        // Show source code snippets
include_github: boolean        // Show GitHub URLs
```

**Query Example**:
```bash
mcp__mfaitools__search_code({
  query: "SMS package",
  include_scenarios: true,
  include_errors: true
})
```

**Test Plan**:
- Add parameters to SELECT queries
- Modify output formatting to conditionally show arrays
- Verify arrays display correctly when requested
- Ensure backward compatibility (defaults to current behavior)

#### Step 1.2: Enhanced Output Formatting  
**What**: Better formatting for rich arrays and metadata  
**Risk**: Zero - only affects display  
**Features**:
- Proper array formatting with bullets/numbers
- Truncation options for long arrays
- GitHub URL validation and display
- Source code syntax highlighting indicators

### Phase 2: User-Controlled Search Types (LOW RISK - Additive Features)

#### Step 2.1: Explicit Search Type Parameter
**What**: Let user choose search strategy explicitly  
**Risk**: Low - additive parameter with fallback to current behavior  
**Implementation**:
```typescript
search_type: 'general' | 'package' | 'error' | 'usage' | 'concept'
```

**Search Types**:
- `general` (default): Current `search_vector` behavior  
- `package`: Prioritize exact `package_code` matches
- `error`: Search `typical_errors`/`common_pitfalls` arrays first
- `usage`: Search `user_scenarios`/`use_cases` arrays first  
- `concept`: Search `statistical_concepts`/`related_concepts` arrays first

**Query Examples**:
```bash
# Exact package matching
mcp__mfaitools__search_code({
  query: "SMS",
  search_type: "package"
})

# Error troubleshooting  
mcp__mfaitools__search_code({
  query: "convergence failed",
  search_type: "error"
})

# Usage examples
mcp__mfaitools__search_code({
  query: "karst modeling", 
  search_type: "usage"
})
```

**Test Plan**:
- Implement each search type as separate SQL strategy
- Verify each type returns appropriate prioritized results
- Ensure fallback to general search works
- Test performance impact of each strategy

#### Step 2.2: User-Controlled Filters  
**What**: Let user filter by indexed fields  
**Risk**: Low - uses existing indexes  
**Implementation**:
```typescript
// Optional filter parameters
package_code: string          // Exact package code filter (FloPy)
model_family: string          // Model family filter (FloPy)  
category: string              // Category filter (PyEMU)
```

**Query Examples**:
```bash
# Filter by specific package
mcp__mfaitools__search_code({
  query: "boundary condition",
  package_code: "WEL"
})

# Filter by model family
mcp__mfaitools__search_code({
  query: "solver",
  model_family: "mf6"
})

# Filter PyEMU by category
mcp__mfaitools__search_code({
  query: "uncertainty",
  category: "core"
})
```

### Phase 3: Field-Specific Search (LOW RISK - User-Controlled)

#### Step 3.1: User-Controlled Field Search
**What**: Let user choose which fields to search beyond `search_vector`  
**Risk**: Low - optional parameters with clear SQL performance characteristics  
**Implementation**:
```typescript
// Search scope options (all default: false)
search_docstring: boolean     // Include module_docstring in search
search_purpose: boolean       // Include semantic_purpose in search  
search_arrays: boolean        // Include array fields in search
search_source: boolean        // Include source_code in search
```

**Query Example**:
```bash
mcp__mfaitools__search_code({
  query: "array size mismatch",
  search_arrays: true,         // Search in typical_errors arrays
  search_docstring: true       // Search in docstrings too
})
```

**Implementation Strategy**:
```sql
-- Dynamic WHERE clause based on user options
WHERE (
  search_vector @@ to_tsquery('english', $1)
  ${search_purpose ? "OR to_tsvector('english', semantic_purpose) @@ to_tsquery('english', $1)" : ""}
  ${search_docstring ? "OR to_tsvector('english', module_docstring) @@ to_tsquery('english', $1)" : ""}
  ${search_arrays ? "OR to_tsvector('english', array_to_string(user_scenarios, ' ')) @@ to_tsquery('english', $1)" : ""}
)
```

**Why This is Sufficient**: Users can explicitly control which fields are searched. No complex multi-stage logic needed - just clear, predictable SQL queries based on user preferences.

## Implementation Strategy

### Final Schema (Simple and User-Controlled)
```typescript
export const searchCodeSchema = {
  name: "search_code",
  description: "Search MODFLOW/PEST code modules with user-controlled search strategies and display options",
  inputSchema: {
    type: 'object',
    properties: {
      // Core parameters
      query: {
        type: 'string',
        description: 'Search query'
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, or omit for all'
      },
      limit: {
        type: 'number', 
        description: 'Maximum results (1-50, default: 10)'
      },
      
      // Phase 1: Display options
      include_scenarios: {
        type: 'boolean',
        description: 'Include user scenarios and use cases (default: false)'
      },
      include_concepts: {
        type: 'boolean', 
        description: 'Include related concepts and statistical concepts (default: false)'
      },
      include_errors: {
        type: 'boolean',
        description: 'Include typical errors and common pitfalls (default: false)'
      },
      include_pest: {
        type: 'boolean',
        description: 'Include PEST integration details (default: false)'
      },
      include_source: {
        type: 'boolean',
        description: 'Include source code snippets (default: false)'
      },
      include_github: {
        type: 'boolean',
        description: 'Include GitHub URLs (default: true)'
      },
      include_snippet: {
        type: 'boolean',
        description: 'Include highlighted content snippets (default: false)'
      },
      
      // Phase 2: Search strategy  
      search_type: {
        type: 'string',
        enum: ['general', 'package', 'error', 'usage', 'concept'],
        description: 'Search strategy: general (default), package (exact codes), error (troubleshooting), usage (scenarios), concept (theory)'
      },
      
      // Phase 2: Filters
      package_code: {
        type: 'string',
        description: 'Filter by specific MODFLOW package code (WEL, RCH, SMS, etc.)'
      },
      model_family: {
        type: 'string',
        description: 'Filter by model family (mf6, mfusg, modflow, mt3d)' 
      },
      category: {
        type: 'string',
        description: 'Filter PyEMU by category (core, utils, plot)'
      },
      
      // Phase 3: Field search
      search_docstring: {
        type: 'boolean',
        description: 'Include module docstring in search (default: false)'
      },
      search_purpose: {
        type: 'boolean', 
        description: 'Include semantic purpose in search (default: false)'
      },
      search_arrays: {
        type: 'boolean',
        description: 'Include array fields in search (default: false)'
      },
      search_source: {
        type: 'boolean',
        description: 'Include source code in search (default: false)'
      }
    },
    required: ['query']
  }
};
```

### Testing Protocol for Each Phase
1. **Backward Compatibility**: Ensure existing queries work unchanged
2. **Performance Testing**: Measure response time vs baseline for each new option  
3. **Quality Testing**: Manual verification that new options improve search relevance
4. **Integration Testing**: Test combinations of parameters
5. **User Testing**: Validate that options are intuitive and useful

### Rollback Strategy  
- Each phase is additive - can be disabled via parameter defaults
- Any step can be reverted by setting defaults back to current behavior
- Original simple search remains as `search_type: 'general'` (default)

### Success Metrics
- **User Control**: Users can find exactly what they're looking for
- **Performance**: Response time < 3 seconds even with advanced options
- **Quality**: Relevant results for specialized searches (error, usage, concept)
- **Discoverability**: Schema clearly explains all available options

## Example Usage Scenarios

### Basic Enhanced Display
```bash
# Just want to see usage examples
mcp__mfaitools__search_code({
  query: "recharge package", 
  include_scenarios: true
})
```

### Targeted Problem Solving  
```bash
# Debugging SMS solver issues
mcp__mfaitools__search_code({
  query: "convergence failed",
  search_type: "error",
  package_code: "SMS", 
  include_errors: true
})
```

### Learning/Tutorial Mode
```bash
# Learning uncertainty analysis
mcp__mfaitools__search_code({
  query: "parameter uncertainty",
  search_type: "usage",
  category: "core",
  include_scenarios: true,
  include_concepts: true
})
```

### Field-Specific Search
```bash
# Search in docstrings and arrays
mcp__mfaitools__search_code({
  query: "array size mismatch",
  search_arrays: true,
  search_docstring: true,
  include_errors: true
})
```

## Simplified Roadmap (No Overkill)

### Phase 1: Enhanced Display (IMPLEMENTED ✅)
- User-controlled rich metadata display  
- GitHub URLs, snippets, array formatting
- Boolean parameter parsing fix

### Phase 2: Search Strategies (IMPLEMENTED ✅) 
- 5 search types: general, package, error, usage, concept
- Filters: package_code, model_family, category
- User controls search focus without complexity

### Phase 3: Field Search (PLANNED)
- User-controlled field inclusion in search
- Simple OR clauses based on user preferences
- No multi-stage complexity - just direct field control

### End State
**Simple, user-controlled tool** where users explicitly choose:
- What to display (arrays, snippets, GitHub URLs)
- How to search (strategy + filters) 
- Which fields to include in search

**No hardcoded logic, no multi-stage complexity, no "intelligent" assumptions.**

## Next Steps

1. ✅ **Phase 1 Complete**: Rich display options working
2. ✅ **Phase 2 Complete**: Search strategies and filters working  
3. **Phase 3 Only**: Add field search options when user requests them
4. **Done**: Simple, powerful, user-controlled search tool

This roadmap focuses on **user control** without overengineering. Users get exactly what they ask for, nothing more, nothing less.