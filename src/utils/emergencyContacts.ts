import { EmergencyFacility } from '../types';
import { normalizeVoiceText } from './voiceCommands';

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${normalizeVoiceText(phrase)} `);
}

export function matchEmergencyContacts(
  transcript: string,
  contacts: EmergencyFacility[]
): EmergencyFacility[] {
  const normalized = normalizeVoiceText(transcript);
  if (!normalized) return [];

  const scored = contacts.flatMap(contact => {
    const matchingAliases = [contact.name, ...(contact.aliases ?? [])]
      .map(alias => normalizeVoiceText(alias))
      .filter(alias => alias.length > 0 && containsPhrase(normalized, alias));
    const score = matchingAliases.reduce((highest, alias) => Math.max(highest, alias.length), 0);
    return score > 0 ? [{ contact, score }] : [];
  });
  const highestScore = Math.max(0, ...scored.map(match => match.score));
  return scored.filter(match => match.score === highestScore).map(match => match.contact);
}

export function getEmergencyDialNumbers(contact: string): string[] {
  const parts = contact.split(/\s*(?:\/|,|;|\bor\b|\band\b)\s*/i);
  const numbers = parts.flatMap(part =>
    part.match(/\+?\d[\d\s().-]*\d|\b\d{2,5}\b/g) ?? []
  );
  return [...new Set(numbers.map(number => number.replace(/[^\d+]/g, '')).filter(Boolean))];
}

export function getRelevantEmergencyContacts(
  transcript: string,
  contacts: EmergencyFacility[]
): EmergencyFacility[] {
  const namedMatches = matchEmergencyContacts(transcript, contacts);
  if (namedMatches.length > 0) return namedMatches;

  const text = normalizeVoiceText(transcript);
  let relevant: EmergencyFacility[] = [];
  if (/(ambulance|medical|injur|heart|एम्बुलेंस|रुग्णवाहिका|अस्पताल|रुग्णालय)/.test(text)) {
    relevant = contacts.filter(contact => contact.type === 'Ambulance');
  } else if (/(fire|water rescue|अग्निशमन|आग|जल बचाव)/.test(text)) {
    relevant = contacts.filter(contact => contact.type === 'Fire & Rescue');
  } else if (/(animal|pet|पशु|प्राणी|पालतू|पाळीव)/.test(text)) {
    relevant = contacts.filter(contact => contact.type === 'Animal Rescue' || contact.type === 'Veterinary');
  } else if (/(ndrf|बटालियन)/.test(text)) {
    relevant = contacts.filter(contact => contact.type === 'NDRF Post');
  } else if (/(disaster|municipal|पीएमसी|पीसीएमसी|आपदा|आपत्ती)/.test(text)) {
    relevant = contacts.filter(contact => contact.type === 'Disaster Control');
  }
  return relevant.length > 0 ? relevant : contacts;
}
