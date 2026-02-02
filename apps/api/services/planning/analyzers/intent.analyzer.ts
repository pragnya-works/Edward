import { IntentAnalysisSchema, IntentAnalysis } from '../schemas.js';
import { generateResponse } from '../../../lib/llm/response.js';
import { logger } from '../../../utils/logger.js';

const ANALYSIS_SYSTEM_PROMPT = `You are a technical architect analyzer. Analyze the user request and determine the best project structure.
Respond ONLY with a JSON object.

Allowed Values:
- type: 'landing', 'dashboard', 'portfolio', 'ecommerce', 'blog', 'custom'
- complexity: 'simple', 'moderate', 'complex'
- suggestedFramework: 'nextjs', 'vite-react', 'vanilla'

Return exact JSON structure:
{
  "type": string,
  "complexity": string,
  "features": string[],
  "recommendedPackages": string[],
  "suggestedFramework": string,
  "reasoning": string
}`;

export async function analyzeIntent(input: string, apiKey: string): Promise<IntentAnalysis> {
    const response = await generateResponse(
        apiKey, 
        `User Request: "${input}"`, 
        [], 
        ANALYSIS_SYSTEM_PROMPT
    );
    
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');
        
        const parsed = JSON.parse(jsonMatch[0]);
        return IntentAnalysisSchema.parse(parsed);
    } catch (error) {
        logger.error(error, 'Intent analysis failed');
        return IntentAnalysisSchema.parse({
            type: 'custom',
            complexity: 'moderate',
            features: [],
            recommendedPackages: [],
            suggestedFramework: 'nextjs',
            reasoning: 'Fallback logic invoked'
        });
    }
}
