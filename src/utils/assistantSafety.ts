const backendGroundedPromptTerms =
  /\b(?:weather|rain(?:fall)?|flood(?:ed|ing)?|waterlogg(?:ing|ed)?|water level|hazard|risk|closure|closed|traffic|route|shelter|hospital|emergency|rescue|helpline|alert|report|source|dataset|current conditions?|near me|pune|pcmc|safe(?:st|ty)?|danger|evacuat(?:e|ion)|home)\b|बारिश|वर्षा|बाढ़|सड़क|रास्ता|मार्ग|आश्रय|अस्पताल|आपात|बंद|जोखिम|मौसम|पानी|खतरा|हेल्पलाइन|सूचना|रिपोर्ट|पाऊस|पर्जन्य|पूर|रस्ता|निवारा|रुग्णालय|आपत्कालीन|जोखीम|हवामान|धोका|अहवाल/i;

export function requiresBackendGrounding(message: string): boolean {
  return backendGroundedPromptTerms.test(message);
}
