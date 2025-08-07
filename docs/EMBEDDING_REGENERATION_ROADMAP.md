# Embedding Regeneration Roadmap

## **Project Goal**
Regenerate high-quality embeddings for FloPy and PyEMU workflows using rich conceptual content instead of truncated setup code.

## **Problem Statement**

**Current Issue**: Semantic search returns poor results with very low similarity scores (0.02-0.06) because embeddings are generated from setup code rather than conceptual content.

**Root Cause**: The `embedding_text` field contains:
- Truncated `description` (setup code snippets like "temporary directory Define the model dimensions")  
- Generic file operations instead of hydrogeological concepts

**Rich Content Available**: The database contains high-quality conceptual content in:
- `workflow_purpose`: Detailed modeling objectives and hydrogeological problems
- `best_use_cases`: Real-world application scenarios  
- `prerequisites`: Required knowledge and context
- `implementation_tips` / `best_practices`: Expert guidance

## **Phase 1: Content Strategy & Analysis**

### **1.1 Content Audit**
- **Analyze current `embedding_text`**: What percentage is setup code vs conceptual content?
- **Evaluate rich content fields**: `workflow_purpose`, `best_use_cases`, `prerequisites`, etc.
- **Content length analysis**: How long are the combined rich fields vs current embedding text?
- **Quality assessment**: Sample 20 tutorials, compare current vs potential embedding content

### **1.2 Embedding Content Design**
- **Primary content sources** (ordered by semantic value):
  1. `title` (always include)
  2. `workflow_purpose` (main conceptual description)  
  3. `best_use_cases` (real-world applications)
  4. `prerequisites` (contextual knowledge)
  5. `tags` (topic keywords)

- **Secondary content** (if space allows):
  - `common_modifications` (FloPy only)
  - `implementation_tips` (PyEMU only)  
  - `pest_concepts` (PyEMU only)

- **Content to EXCLUDE**:
  - `description` (setup code)
  - `source_code` (implementation details)
  - File paths, temporary directories, imports

## **Phase 2: Embedding Generation Strategy**

### **2.1 Content Concatenation Rules**
- **Format**: `{title}. {workflow_purpose} Use cases: {best_use_cases_summary} Prerequisites: {prerequisites_summary}`
- **Length limits**: Target 2000-4000 characters (optimal for embeddings)
- **Array handling**: Convert arrays to readable sentences
- **Deduplication**: Remove redundant information between fields

### **2.2 OpenAI API Configuration**
- **Model**: `text-embedding-3-small` or `text-embedding-ada-002`
- **Batch size**: 50-100 tutorials per API call (cost efficiency)
- **Rate limiting**: Respect OpenAI limits (3000 RPM for tier 1)
- **Error handling**: Retry failed embeddings, log problematic content

### **2.3 System Prompts (if using instruct models)**
Not needed for embedding models, but for content preprocessing:
```
"Summarize this hydrogeological workflow description focusing on: 
1) The main modeling objective
2) Key hydrogeological concepts  
3) Practical applications
4) Required knowledge
Avoid implementation details, code, or file paths."
```

## **Phase 3: Database Schema & Migration**

### **3.1 Database Changes**
- **New columns**:
  - `new_embedding_text` (text) - Rich conceptual content
  - `new_embedding` (vector) - New embedding vectors
  - `embedding_version` (text) - Track embedding generation method
  - `embedding_generated_at` (timestamp) - Generation timestamp

- **Migration strategy**:
  - Keep old embeddings during testing
  - A/B test old vs new embeddings  
  - Gradual rollover after validation

### **3.2 Content Processing Pipeline**
1. **Extract** rich content from workflow tables
2. **Clean & format** content (remove code, format arrays)
3. **Concatenate** according to rules
4. **Generate embeddings** via OpenAI API
5. **Store** in new columns
6. **Validate** embedding quality

## **Phase 4: Quality Validation**

### **4.1 Embedding Quality Tests**
- **Similarity benchmarks**: Known similar tutorials should have >0.8 similarity
- **Concept clustering**: Related concepts (calibration, uncertainty) should cluster  
- **Query relevance**: Test queries should return conceptually appropriate results
- **Cross-validation**: Manual review of top results for test queries

### **4.2 A/B Testing Framework**
- **Comparison metrics**: Precision@5, relevance scores, user feedback
- **Test queries**: 20 diverse semantic queries spanning both repositories
- **Success criteria**: New embeddings show >50% improvement in relevance

## **Phase 5: Production Deployment**

### **5.1 Semantic Search Tool Updates**
- **Column switch**: Update queries to use `new_embedding` instead of `embedding`
- **Fallback handling**: Graceful degradation if new embeddings unavailable
- **Performance monitoring**: Track similarity score distributions

### **5.2 Monitoring & Maintenance**
- **Quality metrics**: Track average similarity scores over time
- **Content drift**: Monitor when workflow descriptions change significantly
- **Re-embedding triggers**: Automated detection of stale embeddings

## **Implementation Details for Coding Assistant**

### **Database Connection Requirements**
- **Project ID**: `autumn-math-76166931` (modflow_ai)
- **Tables**: `flopy_workflows`, `pyemu_workflows`
- **Required permissions**: SELECT (read content), UPDATE (write embeddings)

### **Key Columns to Read**
```sql
SELECT 
  id,
  title,
  workflow_purpose,
  best_use_cases,
  prerequisites,
  common_modifications,  -- FloPy only
  implementation_tips,   -- PyEMU only  
  pest_concepts,         -- PyEMU only
  tags,
  complexity,
  model_type,
  packages_used
FROM flopy_workflows/pyemu_workflows
```

### **Content Processing Logic**
1. **Title**: Always include as-is
2. **Arrays**: Join with ". " and limit to first 3-5 items
3. **Long text**: Truncate at 1000 chars with "..." if needed
4. **Null handling**: Skip null/empty fields gracefully
5. **Final length**: Target 2000-4000 characters total

### **Example Content Transformation**

#### **Before (Current)**
```
"Support for PEST + - This notebook will work with a simple model using the dimensions below + temporary directory Define the model dimensions unknown DIS LPF RCH"
```

#### **After (Improved)**  
```
"Support for PEST. The primary objective of this workflow is to demonstrate how to construct a basic MODFLOW model using FloPy in a manner that is structured for automated calibration and uncertainty analysis using the PEST software suite. Use cases: Aquifer characterization and parameter estimation for pumping test analysis. Water supply impact analysis with uncertainty quantification. Foundation for contaminant transport modeling. Prerequisites: Basic understanding of groundwater flow principles. Familiarity with MODFLOW concepts. Python programming experience."
```

## **Content Quality Examples**

### **FloPy Workflow Rich Content Structure**
- **Title**: Clear, descriptive workflow name
- **Workflow Purpose**: 2-4 paragraphs of hydrogeological context and modeling objectives  
- **Best Use Cases**: 3-4 detailed real-world application scenarios
- **Prerequisites**: 3-6 items covering required knowledge areas
- **Common Modifications**: Typical variations and extensions

### **PyEMU Workflow Rich Content Structure**  
- **Title**: Clear, descriptive workflow name
- **Workflow Purpose**: 2-4 paragraphs of uncertainty analysis context and objectives
- **Common Applications**: 3-4 detailed use cases for uncertainty methods
- **Prerequisites**: 3-6 items covering statistical and hydrogeological knowledge
- **Implementation Tips**: 3-10 expert guidance points
- **Best Practices**: 3-10 workflow optimization recommendations

## **Success Metrics**
- **Coverage**: 100% of tutorials get new embeddings
- **Quality**: Average similarity for relevant queries >0.6  
- **Performance**: Semantic search finds conceptually correct results
- **Cost**: <$50 total for embedding generation
- **Time**: Complete regeneration in <2 hours

## **Risk Mitigation**

### **Technical Risks**
- **API Rate Limits**: Implement exponential backoff and batching
- **Content Length**: Monitor token usage, implement smart truncation  
- **Database Migrations**: Use staging environment first, backup before changes
- **Embedding Storage**: Ensure sufficient database storage for new vectors

### **Quality Risks**
- **Content Inconsistency**: Standardize array formatting and text cleaning
- **Missing Content**: Graceful handling of incomplete workflow metadata
- **Concept Drift**: Establish baseline metrics before migration
- **Regression**: Maintain ability to rollback to old embeddings

This roadmap provides a systematic approach to fixing the core embedding quality issue that's limiting semantic search effectiveness by leveraging the rich conceptual content already available in the database.