import { RoadNode } from '../types';
import { RouteMode } from './rules';

export type VoiceIntent =
  | 'route'
  | 'shelters'
  | 'hospitals'
  | 'community-reports'
  | 'submit-report'
  | 'my-reports'
  | 'alerts'
  | 'emergency'
  | 'sources'
  | 'route-status'
  | 'repeat'
  | 'confirm'
  | 'cancel'
  | 'retry'
  | 'unknown';

export function normalizeVoiceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some(phrase => text.includes(phrase));
}

function containsWholePhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${normalizeVoiceText(phrase)} `);
}

export function recognizeVoiceIntent(transcript: string): VoiceIntent {
  const text = normalizeVoiceText(transcript);
  if (['repeat', 'say that again', 'tell me again', 'फिर से', 'पुन्हा सांगा'].some(phrase => containsWholePhrase(text, phrase))) return 'repeat';
  if (['cancel', 'never mind', 'stop', 'no', 'रद्द', 'नको', 'नहीं', 'थांबा', 'थांबवा'].some(phrase => containsWholePhrase(text, phrase))) return 'cancel';
  if (['yes', 'confirm', 'call now', 'हो', 'हां', 'हाँ', 'होय', 'पुष्टि', 'पुष्टी करा'].some(phrase => containsWholePhrase(text, phrase))) return 'confirm';
  if (['retry', 'try again', 'फिर कोशिश', 'पुन्हा प्रयत्न'].some(phrase => containsWholePhrase(text, phrase))) return 'retry';
  if (text === 'emergency') return 'emergency';

  if (includesAny(text, ['my reports', 'my report', 'मेरी रिपोर्ट', 'मेरी रिपोर्टें', 'माझे अहवाल'])) return 'my-reports';
  if (includesAny(text, ['submit a report', 'report flooding', 'report waterlogging', 'report a blocked road', 'i want to report', 'there is waterlogging', 'waterlogging on', 'road flooded on', 'नया रिपोर्ट', 'तक्रार नोंदवा', 'पाणी साचले'])) return 'submit-report';
  if (includesAny(text, ['shelter', 'आश्रय', 'निवारा', 'शरण', 'where can i go', 'with my family', 'परिवार के साथ', 'कुटुंबासह'])) return 'shelters';
  if (includesAny(text, ['hospital', 'medical facility', 'रुग्णालय', 'अस्पताल', 'डॉक्टर'])) return 'hospitals';
  if (includesAny(text, ['show flood reports', 'community reports', 'waterlogging near', 'road blockage reports', 'flood warnings nearby', 'बाढ़ की रिपोर्ट', 'पूर अहवाल'])) return 'community-reports';
  if (includesAny(text, [
    'sos', 'emergency help', 'emergency assistance', 'call emergency services',
    'need help', 'help me', 'i am trapped', 'i am stuck', 'stuck in floodwater', 'need rescue',
    'need an ambulance', 'ambulance chahiye', 'mujhe madad chahiye', 'madad karo', 'mujhe bachao',
    'मदद चाहिए', 'मुझे मदद', 'मदद करो', 'मुझे बचाओ', 'बचाओ',
    'mala madat pahije', 'mala madat havi', 'madat kara', 'mala vachva',
    'मला मदत पाहिजे', 'मला मदत हवी', 'मदत करा', 'मला वाचवा', 'मदत हवी'
  ])) return 'emergency';
  if (includesAny(text, ['my alerts', 'latest emergency alerts', 'flood warnings', 'show alerts', 'danger near my location', 'चेतावनी', 'इशारा', 'अलर्ट'])) return 'alerts';
  if (includesAny(text, ['data source', 'data sources', 'where does the flood data', 'how is road risk calculated', 'sources', 'डेटा स्रोत', 'माहिती स्रोत'])) return 'sources';
  if (includesAny(text, ['closed road', 'road closed', 'risky road', 'route safe', 'route risk', 'flood risk on my route', 'समापन', 'बंद सड़क'])) return 'route-status';
  if (includesAny(text, ['route', 'safest', 'fastest', 'shortest', 'avoid flooded roads', 'alternate route', 'how much time', 'मार्ग', 'रास्ता', 'रूट', 'सुरक्षित रास्ता'])) return 'route';
  return 'unknown';
}

export function recognizeRouteMode(transcript: string): RouteMode {
  const text = normalizeVoiceText(transcript);
  if (includesAny(text, ['fastest', 'quickest', 'जल्दी', 'तेज'])) return 'fastest';
  if (includesAny(text, ['shortest', 'कम दूरी', 'लहान', 'छोटा'])) return 'shortest';
  return 'safest';
}

export function findMentionedNode(
  transcript: string,
  nodes: Record<string, RoadNode>
): RoadNode | undefined {
  return findMentionedNodes(transcript, nodes)[0];
}

export function findMentionedNodes(
  transcript: string,
  nodes: Record<string, RoadNode>
): RoadNode[] {
  const text = normalizeVoiceText(transcript);
  const candidates = Object.values(nodes).flatMap(node => {
    const aliases = [
      node.name,
      ...node.name.split(/[(/]/).map(part => part.replace(/[)]/g, ''))
    ]
      .map(normalizeVoiceText)
      .filter(alias => alias.length > 2);
    return [...new Set(aliases)].map(name => ({ node, name }));
  }).sort((left, right) => right.name.length - left.name.length);
  const mentions: Array<{ node: RoadNode; start: number; end: number }> = [];
  candidates.forEach(candidate => {
    let start = text.indexOf(candidate.name);
    while (start >= 0) {
      const end = start + candidate.name.length;
      if (!mentions.some(mention => start < mention.end && end > mention.start)) {
        mentions.push({ node: candidate.node, start, end });
      }
      start = text.indexOf(candidate.name, start + candidate.name.length);
    }
  });
  return mentions.sort((left, right) => left.start - right.start).map(mention => mention.node);
}

export function findRoadMention(transcript: string, roadNames: string[]): string | undefined {
  const text = normalizeVoiceText(transcript);
  const candidates = roadNames.flatMap(roadName => {
    const aliases = [
      roadName,
      ...roadName.split(/[(/]/).map(part => part.replace(/[)]/g, ''))
    ]
      .map(normalizeVoiceText)
      .filter(alias => alias.length > 2);
    return [...new Set(aliases)].map(alias => ({ roadName, alias }));
  }).sort((left, right) => right.alias.length - left.alias.length);
  const candidate = candidates.find(item => text.includes(item.alias));
  if (!candidate) return undefined;
  const matchingRoads = new Set(
    candidates.filter(item => item.alias === candidate.alias).map(item => item.roadName)
  );
  return matchingRoads.size === 1 ? candidate.roadName : undefined;
}
