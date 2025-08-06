# MODFLOW AI MCP Tools - Development Roadmap

## Project Overview

Production-ready MCP (Model Context Protocol) Server providing AI-powered search across the MODFLOW/PEST ecosystem. Deployed on Cloudflare Workers with OAuth authentication and hybrid search capabilities.

**Current Status**: ✅ **Phase 1 Complete** - Hybrid search across documentation, code modules, and workflows

## Architecture Evolution

### Current Architecture (Phase 1) ✅
- `text_search_repository` - Full-text search across all content types
- `semantic_search_repository` - AI-powered semantic search across all content types  
- `get_file_content` - Retrieve complete file content by exact path

**Content Coverage:**
- Documentation: MODFLOW 6, PEST, PEST++, MODFLOW-USG guides
- Code Modules: FloPy packages, PyEMU utilities with rich metadata
- Workflows: FloPy tutorials, PyEMU notebooks with complexity/tags

### Target Architecture (Phase 2-3) 🎯
Based on MCP best practices: **fewer, general tools with well-defined parameters**

```
search_examples (search_type: "text" | "semantic", repository?, filters?)
search_code (search_type: "text" | "semantic", repository?, filters?)  
search_documentation (search_type: "text" | "semantic", repository?, filters?)
get_file_content (repository, filepath)
```

## Development Phases

### Phase 1: Foundation ✅ **COMPLETE**
**Objective**: Establish comprehensive hybrid search across all MODFLOW content types

**Achievements:**
- ✅ Extended text search to support FloPy/PyEMU module tables with rich metadata
- ✅ Extended semantic search to use real OpenAI embeddings for vector similarity  
- ✅ Added workflow search for both FloPy tutorials and PyEMU notebooks
- ✅ Implemented hybrid search strategy (docs + modules + workflows)
- ✅ Rich metadata display: packages, complexity, tags, use cases, concepts
- ✅ AI-focused tool descriptions for proper LLM tool selection
- ✅ Production deployment with OAuth authentication

**Technical Implementation:**
- Database tables: `repository_files`, `flopy_modules`, `pyemu_modules`, `flopy_workflows`, `pyemu_workflows`
- Vector search: OpenAI text-embedding-3-small with pgvector indices
- Full-text search: PostgreSQL tsvector with weighted ranking
- Metadata filtering: GIN indices on array fields for fast filtering

### Phase 2: Content-Focused Tool Architecture 🚧 **PLANNED**
**Objective**: Align tools with user mental models and MCP best practices

**User Intent Analysis:**
- **"How do I DO something?"** → `search_examples` (workflows, tutorials, complete implementations)
- **"What are the API details?"** → `search_code` (modules, functions, parameters)  
- **"What's the theory?"** → `search_documentation` (guides, mathematical background)

**Implementation Plan:**
1. **Create new tool interfaces** with content-specific schemas
2. **Implement content-specific optimization**:
   - Examples: Prioritize completeness, step-by-step clarity, working code
   - Code: Prioritize API accuracy, parameter details, function signatures
   - Documentation: Prioritize conceptual explanation, theory, background
3. **Add search_type parameter** for text vs semantic choice
4. **Maintain backward compatibility** during transition
5. **Update tool descriptions** to reflect specialized purposes

**Expected Benefits:**
- Better AI tool selection based on user intent
- Specialized result ranking per content type
- Focused metadata display for each domain
- Improved user experience with clearer tool purposes

### Phase 3: Advanced Features & Optimization 🔮 **FUTURE**
**Objective**: Advanced capabilities and performance optimization

**Potential Features:**
- **Cross-Reference Analysis**: "Find all examples using this package"
- **Difficulty Progression**: "Show beginner examples, then intermediate"
- **Integration Workflows**: "Complete FloPy + PyEMU uncertainty analysis pipeline"
- **Code Generation**: Template generation from examples
- **Smart Filtering**: AI-powered filter suggestions based on query context
- **Multi-Modal Search**: Support for diagrams, equations, figures in documentation

**Performance & Scalability:**
- Query caching and optimization
- Embedding model fine-tuning for MODFLOW domain
- Advanced ranking algorithms
- Real-time content updates and reindexing

## Technical Debt & Improvements

### Code Quality
- [ ] Refactor shared search logic into utility functions
- [ ] Implement comprehensive error handling and retry logic
- [ ] Add unit tests for search functions
- [ ] Standardize database query patterns

### Performance
- [ ] Implement query result caching
- [ ] Optimize database indices based on usage patterns
- [ ] Add query performance monitoring
- [ ] Implement query complexity limits

### User Experience  
- [ ] Add search result snippets with better context
- [ ] Implement relevance scoring explanations
- [ ] Add "did you mean?" suggestions for typos
- [ ] Provide search tips and example queries

## Decision Log

### Why Content-Focused Tools? (Phase 2)
**Decision**: Split into `search_examples`, `search_code`, `search_documentation`

**Rationale**:
- **MCP Best Practice**: Perplexity Pro analysis confirms fewer, parameterized tools > many specialized tools
- **User Mental Models**: Different search intents require different optimization strategies  
- **AI Tool Selection**: Clearer tool names improve LLM decision-making
- **Search Optimization**: Each content type has different relevance criteria

**Alternative Considered**: Keep 2 current tools, add content_type parameter
**Why Rejected**: Doesn't align with user intent-based mental models

### Why Hybrid Search Strategy?
**Decision**: Combine documentation + modules + workflows in single results

**Rationale**:
- Users often need multiple content types to solve problems
- Real-world workflows span theory → implementation → examples
- Semantic ranking can surface the most relevant content regardless of type

### Why OpenAI Embeddings?
**Decision**: Use OpenAI text-embedding-3-small for semantic search

**Rationale**:
- High-quality embeddings optimized for code and technical content
- Proven performance in retrieval tasks
- Cost-effective for production deployment
- Better than local models for specialized MODFLOW terminology

## Success Metrics

### Phase 1 Metrics ✅
- **Coverage**: 9 repositories, 4 content types searchable
- **Performance**: <2s average search response time
- **Quality**: Semantic search finds conceptually related content
- **Deployment**: Production-ready with OAuth authentication

### Phase 2 Targets 🎯
- **User Intent Alignment**: >80% of searches use correct tool for intent
- **Result Relevance**: Improved ranking for content-specific searches
- **AI Tool Selection**: Reduced tool selection errors in LLM usage
- **Search Success Rate**: Higher completion rate for user search tasks

### Phase 3 Aspirations 🔮
- **Comprehensive Coverage**: All major MODFLOW/PEST resources indexed
- **Expert-Level Assistance**: AI-powered workflow recommendations
- **Community Integration**: User-contributed examples and tutorials
- **Performance Excellence**: Sub-second search response times

---

## Contributing

When implementing features from this roadmap:

1. **Follow MCP Best Practices**: Parameterized tools > specialized tools
2. **Maintain Backward Compatibility**: During transitions
3. **Test Thoroughly**: Both functionality and performance
4. **Update Documentation**: Keep this roadmap current with actual progress
5. **Consider User Experience**: Design for both human and AI usage

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)

---

**Last Updated**: January 2025  
**Current Version**: Phase 1 Complete, Phase 2 Planning