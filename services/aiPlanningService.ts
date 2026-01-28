import { GoogleGenerativeAI } from '@google/generative-ai';
import { LinePlan, PagePlan, WritingPlan } from '../types';

export type { LinePlan, PagePlan, WritingPlan };

const PLANNING_PROMPT = `You are a handwriting layout planner. Your job is to take extracted text and plan EXACTLY how a human student would write it in a notebook.

CRITICAL RULES:
1. You are NOT generating solutions - the text is already provided
2. You are ONLY planning the visual layout and style
3. Keep response minimal - just return the JSON plan
4. Maximum 35-40 words per line (notebook line limit)
5. Q1, Q2, Ans, etc go on LEFT side with small indent
6. Main content goes with normal margin
7. Fractions like 7/8 should be marked for vertical rendering
8. Numbers in equations need special spacing

INPUT FORMAT:
- Page texts array with extracted content
- Total pages count

OUTPUT FORMAT (JSON only, no explanation):
{
  "pages": [
    {
      "pageNumber": 1,
      "lines": [
        {
          "lineNumber": 1,
          "content": "Q1.",
          "indent": 5,
          "isQuestionNumber": true,
          "isFraction": false,
          "isHeading": false,
          "alignment": "left",
          "emphasis": "normal",
          "wordSpacing": "normal",
          "baselineVariation": 0.3,
          "slantAngle": -2,
          "pressureLevel": 0.8
        }
      ],
      "marginLeft": 25,
      "marginRight": 15,
      "marginTop": 20,
      "lineSpacing": 28,
      "overallSlant": -3,
      "writingSpeed": "medium",
      "fatigueLevel": 0.1
    }
  ],
  "globalStyle": {
    "consistency": 0.75,
    "neatness": 0.7,
    "speedVariation": 0.2,
    "personalQuirks": ["slight rightward drift", "open loops"]
  }
}

LAYOUT RULES FOR HUMAN-LIKE WRITING:
1. Question numbers (Q1, Q2, Q.1, 1., (a), etc): indent=5, left aligned, isQuestionNumber=true
2. "Ans" or "Answer": indent=5, left aligned
3. Main answer text: indent=25-30, normal alignment
4. Fractions: mark isFraction=true, provide fractionParts
5. Headings/titles: isHeading=true, emphasis="underline"
6. baselineVariation: 0.1-0.5 (how much line wobbles)
7. slantAngle: -5 to 5 degrees (negative = italic left)
8. pressureLevel: 0.6-1.0 (pen pressure)
9. fatigueLevel: increases 0.05-0.1 per page (writing gets messier)
10. wordSpacing: "tight" for equations, "loose" for explanations

FRACTION DETECTION:
- "7/8" → isFraction:true, fractionParts:{numerator:"7",denominator:"8"}
- "3/4" → isFraction:true, fractionParts:{numerator:"3",denominator:"4"}
- Write fractions VERTICALLY like real notebook

LINE BREAKING:
- Break at natural phrase endings
- Max 40 characters per line
- Equations on separate lines
- Keep units with numbers

Return ONLY valid JSON, no markdown, no explanation.`;

export class AIPlanningService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  initialize(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async planWriting(extractedTexts: string[], onProgress?: (status: string) => void): Promise<WritingPlan> {
    if (!this.model) {
      return this.createFallbackPlan(extractedTexts);
    }

    try {
      onProgress?.('AI analyzing document structure...');
      
      const compactInput = extractedTexts.map((text, i) => 
        `PAGE ${i + 1}:\n${text.substring(0, 2000)}`
      ).join('\n---\n');

      const prompt = `${PLANNING_PROMPT}

TEXT TO PLAN:
${compactInput}

Total pages: ${extractedTexts.length}

Return the JSON plan:`;

      onProgress?.('AI planning handwriting layout...');
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      try {
        const plan = JSON.parse(text) as WritingPlan;
        onProgress?.('AI plan ready');
        return this.validateAndEnhancePlan(plan, extractedTexts);
      } catch (parseError) {
        console.warn('AI response parse failed, using fallback');
        return this.createFallbackPlan(extractedTexts);
      }
    } catch (error) {
      console.warn('AI planning failed, using fallback:', error);
      return this.createFallbackPlan(extractedTexts);
    }
  }

  private validateAndEnhancePlan(plan: WritingPlan, texts: string[]): WritingPlan {
    if (!plan.pages || plan.pages.length === 0) {
      return this.createFallbackPlan(texts);
    }

    plan.pages = plan.pages.map((page, pageIdx) => ({
      ...page,
      pageNumber: pageIdx + 1,
      marginLeft: page.marginLeft || 25,
      marginRight: page.marginRight || 15,
      marginTop: page.marginTop || 20,
      lineSpacing: page.lineSpacing || 28,
      overallSlant: page.overallSlant ?? -3,
      writingSpeed: page.writingSpeed || 'medium',
      fatigueLevel: Math.min(0.5, (page.fatigueLevel || 0) + pageIdx * 0.03),
      lines: (page.lines || []).map((line, lineIdx) => ({
        ...line,
        lineNumber: lineIdx + 1,
        indent: line.indent ?? 25,
        isQuestionNumber: line.isQuestionNumber ?? false,
        isFraction: line.isFraction ?? false,
        isHeading: line.isHeading ?? false,
        alignment: line.alignment || 'left',
        emphasis: line.emphasis || 'normal',
        wordSpacing: line.wordSpacing || 'normal',
        baselineVariation: line.baselineVariation ?? 0.3,
        slantAngle: line.slantAngle ?? -2,
        pressureLevel: line.pressureLevel ?? 0.8,
      }))
    }));

    if (!plan.globalStyle) {
      plan.globalStyle = {
        consistency: 0.75,
        neatness: 0.7,
        speedVariation: 0.2,
        personalQuirks: ['natural baseline drift', 'varying pressure']
      };
    }

    return plan;
  }

  private createFallbackPlan(texts: string[]): WritingPlan {
    const pages: PagePlan[] = texts.map((text, pageIdx) => {
      const lines = this.breakIntoLines(text);
      
      return {
        pageNumber: pageIdx + 1,
        lines: lines.map((content, lineIdx) => this.analyzeLine(content, lineIdx, pageIdx)),
        marginLeft: 25 + Math.random() * 5,
        marginRight: 15 + Math.random() * 3,
        marginTop: 20 + Math.random() * 5,
        lineSpacing: 26 + Math.random() * 4,
        overallSlant: -3 + Math.random() * 2,
        writingSpeed: pageIdx < 2 ? 'medium' : 'fast',
        fatigueLevel: Math.min(0.5, pageIdx * 0.05)
      };
    });

    return {
      pages,
      globalStyle: {
        consistency: 0.7 + Math.random() * 0.15,
        neatness: 0.65 + Math.random() * 0.2,
        speedVariation: 0.15 + Math.random() * 0.1,
        personalQuirks: ['slight baseline wobble', 'inconsistent spacing', 'natural slant variation']
      }
    };
  }

  private breakIntoLines(text: string): string[] {
    const lines: string[] = [];
    const paragraphs = text.split(/\n+/);
    
    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/);
      let currentLine = '';
      
      for (const word of words) {
        if ((currentLine + ' ' + word).length > 45) {
          if (currentLine) lines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine = currentLine ? currentLine + ' ' + word : word;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
    }
    
    return lines;
  }

  private analyzeLine(content: string, lineIdx: number, pageIdx: number): LinePlan {
    const isQuestion = /^(Q\.?\s*\d+|Question\s*\d+|\d+\.|[\(\[]?[a-z][\)\]])/i.test(content);
    const isAnswer = /^(Ans\.?|Answer)/i.test(content);
    const isHeading = content.length < 30 && /^[A-Z]/.test(content) && !isQuestion;
    
    const fractionMatch = content.match(/(\d+)\/(\d+)/);
    const isFraction = !!fractionMatch;
    
    const fatigue = pageIdx * 0.03 + lineIdx * 0.002;
    
    return {
      lineNumber: lineIdx + 1,
      content,
      indent: isQuestion || isAnswer ? 5 : 25,
      isQuestionNumber: isQuestion,
      isFraction,
      fractionParts: fractionMatch ? { 
        numerator: fractionMatch[1], 
        denominator: fractionMatch[2],
        remainingText: content.replace(/\d+\/\d+/, '').trim() || undefined
      } : undefined,
      isHeading,
      alignment: 'left',
      emphasis: isHeading ? 'underline' : 'normal',
      wordSpacing: /[0-9+\-×÷=]/.test(content) ? 'tight' : 'normal',
      baselineVariation: 0.2 + Math.random() * 0.3 + fatigue,
      slantAngle: -3 + Math.random() * 2 + fatigue * 2,
      pressureLevel: 0.85 - fatigue * 0.2 + Math.random() * 0.1
    };
  }
}

export const aiPlanningService = new AIPlanningService();
