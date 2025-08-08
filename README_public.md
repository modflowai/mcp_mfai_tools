# MODFLOW AI MCP Server

An advanced Model Context Protocol (MCP) server providing intelligent search capabilities for MODFLOW and PEST documentation, code, and tutorials. This server enables AI assistants to efficiently search and retrieve groundwater modeling resources through specialized tools.

## 🎯 Purpose

This MCP server bridges the gap between AI assistants and the extensive MODFLOW/PEST ecosystem, providing structured access to:
- **Documentation**: Mathematical theory, conceptual explanations, and reference guides
- **Code Modules**: API details, function signatures, and implementation specifics
- **Tutorials**: Step-by-step workflows, practical examples, and best practices

## 🚀 Key Features

### Intelligent Search Capabilities
- **Smart Method Selection**: Automatically chooses between text, semantic, or hybrid search based on query characteristics
- **Acronym Detection & Expansion**: Recognizes MODFLOW/PEST acronyms (WEL, RIV, MAW, etc.) and expands them for better search results
- **GitHub Integration**: Returns direct links to source code on GitHub repositories
- **Contextual Recommendations**: Suggests alternative tools based on query type

### Specialized Search Tools
Each tool is optimized for specific content types, ensuring relevant and accurate results:

1. **Tutorial & Workflow Search** (`search_tutorials`) - Advanced filtering and array search
2. **Semantic Tutorial Search** (`semantic_search_tutorials`) - Concept-based tutorial discovery using embeddings
3. **API & Code Search** (`search_code`) - Multi-strategy search with rich metadata
4. **Theory & Documentation Search** (`search_docs`) - Focused theory search with automatic pagination
5. **Semantic Documentation Search** (`semantic_search_docs`) - Concept-based documentation discovery
6. **Direct File Retrieval** (`get_file_content`) - Complete file access with pagination

## 📚 Available Tools

### 1. search_tutorials
**Purpose**: Find tutorials, workflows, and practical implementations with advanced filtering

**Features**:
- Advanced filtering by model type, packages, complexity
- Returns complete working examples with code
- Array search within use cases, prerequisites, and implementation tips
- Includes complexity levels (beginner/intermediate/advanced)
- Shows packages used and best use cases
- Enhanced snippet highlighting with configurable display options

**Real Example**:
```typescript
// Query: "pumping well example"
mcp__mfaitools__search_tutorials({
  query: "pumping well example",
  limit: 2
})

// Actual Response:
{
  "results": [
    {
      "title": "Hani Problem",
      "filepath": "scripts/ex-gwf-hani.py", 
      "complexity": "beginner",
      "packages": ["CHD", "DIS", "IC", "NPF", "OC"],
      "description": "This problem simulates groundwater flow to a pumping well under horizontally anisotropic groundwater flow conditions."
    }
  ],
  "total_results": 2
}
```

### 2. semantic_search_tutorials
**Purpose**: Find tutorials using concept-based similarity search with OpenAI embeddings

**Features**:
- Uses OpenAI embeddings (text-embedding-ada-002) for conceptual matching
- Finds tutorials by meaning and concepts rather than exact keywords
- Returns similarity scores for relevance assessment
- Default similarity threshold: 0 (shows all results)
- Cross-repository search across FloPy and PyEMU tutorials

**Real Example**:
```typescript
// Query: "PEST parameter estimation example"
mcp__mfaitools__semantic_search_tutorials({
  query: "PEST parameter estimation example",
  limit: 2
})

// Actual Response:
{
  "results": [
    {
      "title": "Error Variance Example: Henry",
      "filepath": "errvarexample_henry.ipynb",
      "complexity": "beginner", 
      "type": "error_variance",
      "packages": ["parameter", "pest"],
      "similarity": 0.025
    }
  ],
  "search_metadata": {
    "average_similarity": 0.023,
    "threshold": 0
  }
}
```

### 3. search_code
**Purpose**: Find API details, function signatures, and class definitions

**Features**:
- Returns detailed module documentation
- Includes package codes and model families
- Shows key concepts and usage scenarios
- Provides parameter lists and method signatures

**Example Query & Response**:
```json
Query: "WEL package parameters"

Response: {
  "results": [{
    "filepath": "flopy/mf6/modflow/mfgwfwel.py",
    "github_url": "https://github.com/modflowpy/flopy/blob/develop/flopy/mf6/modflow/mfgwfwel.py",
    "package_code": "WEL",
    "model_family": "mf6",
    "summary": "The WEL Package simulates wells that withdraw or inject water...",
    "key_concepts": ["Flow rate specification", "Multi-layer wells", "Time-varying pumping"]
  }],
  "search_metadata": {
    "acronyms_detected": {"WEL": "Well"}
  }
}
```

### 4. text_search_repository
**Purpose**: Cross-repository full-text search with keyword matching

**Features**:
- Searches across all documentation, code, and tutorial repositories
- Boolean operators and wildcard support  
- Automatic acronym expansion (WEL → Well Package)
- Highlighted search snippets with ts_headline
- Repository filtering for focused results

**Example Query & Response**:
```json
Query: "recharge package parameters"

Response: {
  "results": [{
    "filepath": "mf6io/gwf-rch.md", 
    "title": "Recharge Package Documentation",
    "repository": "mf6",
    "snippet": "The <mark>recharge</mark> <mark>package</mark> accepts <mark>parameters</mark> for..."
  }],
  "search_metadata": {
    "method_used": "text",
    "acronyms_detected": {}
  }
}
```

### 5. search_documentation
**Purpose**: Find theoretical foundations and mathematical formulations

**Features**:
- Returns comprehensive documentation with key concepts
- Includes mathematical equations and scientific principles
- **Optimized for focused queries (max 3 words)**
- Automatically expands acronyms for better coverage

**Example Query & Response**:
```json
Query: "hydraulic conductivity"

Response: {
  "results": [{
    "filepath": "mf6io/gwf-npf.md",
    "title": "Node Property Flow Package",
    "summary": "Describes hydraulic conductivity implementation in MODFLOW 6...",
    "key_concepts": ["Darcy's Law", "Anisotropy", "Interblock conductance"]
  }],
  "search_metadata": {
    "method_used": "text",
    "query_expanded": "hydraulic conductivity"
  }
}
```

### 6. get_file_content
**Purpose**: Retrieve complete file content by exact path

**Features**:
- Returns full source code or documentation
- No truncation (handles files of any size)
- Includes metadata and file statistics
- Direct access when you know the exact location

**Example Usage**:
```json
Query: {
  "repository": "flopy",
  "filepath": "flopy/mf6/modflow/mfims.py"
}

Response: Complete file content with syntax highlighting and metadata
```

## 🗂️ Supported Repositories

### Documentation Repositories
- **mf6**: MODFLOW 6 comprehensive documentation
- **pest**: Parameter Estimation (PEST) guides
- **pestpp**: PEST++ enhanced version documentation
- **mfusg**: MODFLOW-USG (Unstructured Grid) documentation
- **plproc**: Parameter list processor documentation
- **gwutils**: Groundwater data utilities documentation

### Code Repositories
- **flopy**: Python package for MODFLOW (modules and workflows)
- **pyemu**: Python package for uncertainty analysis (modules and workflows)

## 🔍 Search Intelligence

### Acronym Recognition
The server recognizes common MODFLOW/PEST acronyms and automatically expands them:
- **WEL** → Well Package
- **RIV** → River Package
- **MAW** → Multi-Aquifer Well
- **CHD** → Constant Head Boundary
- **DRN** → Drain Package
- **EVT** → Evapotranspiration
- **RCH** → Recharge
- **SFR** → Streamflow Routing
- And many more...

### Smart Search Method Selection
The server automatically selects the optimal search method:
- **Text Search**: Used for exact terms, acronyms, or quoted phrases
- **Semantic Search**: Used for conceptual queries and "how to" questions
- **Hybrid Search**: Combines both methods for comprehensive results

### GitHub URL Generation
All code results include direct GitHub links:
- FloPy modules: `github.com/modflowpy/flopy/blob/develop/...`
- PyEMU modules: `github.com/pypest/pyemu/blob/develop/...`
- MODFLOW 6 examples: `github.com/MODFLOW-ORG/modflow6-examples/blob/develop/...`

## 📊 Response Format

All tools return structured JSON responses with:
- **results**: Array of matched items with relevant metadata
- **search_metadata**: Information about the search process
  - `method_used`: Search method applied (text/semantic/hybrid)
  - `total_results`: Number of results found
  - `acronyms_detected`: Detected acronyms and their expansions
  - `query_expanded`: Expanded query (for documentation search)
- **recommendations**: Suggestions for alternative tools if applicable

## 🎯 Best Practices

### Query Optimization
1. **Use specific terms**: "MAW package" instead of "well modeling"
2. **Include acronyms**: The server recognizes and expands them automatically
3. **Keep documentation queries short**: Maximum 3 words for optimal results
4. **Specify repository when known**: Faster and more focused results

### Tool Selection Guide
- **Need working code?** → Use `search_examples`
- **Need API details?** → Use `search_code`
- **Need theory/concepts?** → Use `search_documentation`
- **Know exact file path?** → Use `get_file_content`

### Understanding Results
- **complexity**: Indicates difficulty level (beginner/intermediate/advanced)
- **packages_used**: MODFLOW packages required for the example
- **best_use_cases**: Practical applications of the code/concept
- **github_url**: Direct link to view the file on GitHub
- **search_rank**: Relevance score (higher is better)

## 🔧 Technical Architecture

### Infrastructure
- **Deployment**: Cloudflare Workers (edge computing)
- **Database**: Neon PostgreSQL with full-text search
- **Protocol**: Model Context Protocol (MCP) over HTTP
- **Authentication**: OAuth 2.0 (GitHub and Google)

### Performance Features
- **Edge Computing**: Low latency through global CDN
- **Intelligent Caching**: Frequently accessed content cached
- **Optimized Queries**: Database indexes for fast search
- **Parallel Processing**: Multiple searches executed concurrently

### Security
- **OAuth Authentication**: Secure access control
- **User Allowlists**: Restricted to authorized users
- **Encrypted Sessions**: Secure cookie-based sessions
- **Rate Limiting**: Protection against abuse

## 📈 Usage Examples

### Example 1: Finding Multi-Aquifer Well Tutorials
```json
{
  "tool": "search_examples",
  "query": "MAW multi-aquifer well",
  "repository": "flopy",
  "limit": 5
}
```

### Example 2: Understanding Hydraulic Conductivity
```json
{
  "tool": "search_documentation",
  "query": "hydraulic conductivity",
  "limit": 3
}
```

### Example 3: Finding WEL Package API
```json
{
  "tool": "search_code",
  "query": "WEL package constructor",
  "repository": "flopy"
}
```

### Example 4: Retrieving Specific File
```json
{
  "tool": "get_file_content",
  "repository": "mf6",
  "filepath": "mf6io/gwf-npf.md"
}
```

## 🌟 Unique Capabilities

1. **Comprehensive Coverage**: Access to entire MODFLOW/PEST ecosystem
2. **Intelligent Search**: Smart acronym detection and method selection
3. **Direct GitHub Integration**: One-click access to source code
4. **Structured Metadata**: Rich information beyond just text matches
5. **Contextual Recommendations**: Guides users to better tools
6. **No Truncation**: Full file content retrieval
7. **Specialized Tools**: Purpose-built for different content types

## 📝 License

MIT License - Open source and available for community use

## 🤝 Contributing

This project is part of the MODFLOW AI initiative to make groundwater modeling more accessible through AI assistance. Contributions and feedback are welcome.

---

**Built with ❤️ for the groundwater modeling community**