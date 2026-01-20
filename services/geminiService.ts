
import { GoogleGenAI, Type } from "@google/genai";
import { OCRResult, Order } from "../types";

export const extractOrdersFromFile = async (base64DataUrl: string): Promise<OCRResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const mimeTypeMatch = base64DataUrl.match(/^data:(.*);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
  const base64Data = base64DataUrl.replace(/^data:.*;base64,/, '').trim();

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Data } },
        {
          text: `Analyze the provided document and extract order data into a structured table format. 
          Professional Requirements:
          - Extract Vendor Code, Customer Name, Estimate ID, PO/Order Number, Order Date, Expected Receipt Date, and Status.
          - Vendor Code: Standard internal identifier (e.g., SUSM).
          - Customer Name: Full primary entity name.
          - Date format: MM/DD/YY.
          Exclude any irrelevant decorative text or line indexes.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          orders: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                lineNumber: { type: Type.STRING },
                vendorCode: { type: Type.STRING },
                customerName: { type: Type.STRING },
                estNum: { type: Type.STRING },
                orderNum: { type: Type.STRING },
                orderDate: { type: Type.STRING },
                expectedRecvDate: { type: Type.STRING },
                status: { type: Type.STRING }
              },
              required: ["vendorCode", "customerName"]
            }
          }
        }
      }
    }
  });

  try {
    const text = response.text || '{"orders": []}';
    // Use regex to find the actual JSON block in case the model outputs preamble text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (error) {
    console.error("OCR Extraction Error:", error);
    return { orders: [] };
  }
};

export const getAIOrderInsights = async (orders: Order[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const dataset = orders.map(o => ({
    v: o.vendorCode,
    c: o.customerName,
    s: o.status,
    p: o.orderDate,
    e: o.expectedRecvDate,
    d: o.description
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Supply Chain Analysis Task:
    Perform a professional review of the following order dataset.
    Deliverables:
    1. Executive Summary: A high-level overview of operational health.
    2. Strategic Insights: Three actionable observations focusing on efficiency and risk.
    Terminologies must be professional and formal.
    
    Data Source: ${JSON.stringify(dataset)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                type: { type: Type.STRING, description: "One of: positive, warning, alert" }
              },
              required: ["title", "content", "type"]
            }
          }
        },
        required: ["summary", "insights"]
      }
    }
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Null response from model");
    
    // Attempt to extract JSON from the text response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON structure found in response");
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Insight Analysis Error:", error);
    throw error;
  }
};
