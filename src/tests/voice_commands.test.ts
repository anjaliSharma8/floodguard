import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadNode } from '../types';
import {
  findMentionedNodes,
  findRoadMention,
  recognizeRouteMode,
  recognizeVoiceIntent
} from '../utils/voiceCommands';
import { INITIAL_EMERGENCY_FACILITIES } from '../data/puneData';
import {
  getEmergencyDialNumbers,
  getRelevantEmergencyContacts,
  matchEmergencyContacts
} from '../utils/emergencyContacts';

const nodes: Record<string, RoadNode> = {
  start: { id: 'start', name: 'Karve Nagar (Cummins College Chowk)', lat: 18.5, lng: 73.8, elevationM: 0 },
  destination: { id: 'destination', name: 'Pune Railway Station', lat: 18.52, lng: 73.87, elevationM: 0 }
};

test('voice intent recognition covers app actions and multilingual route requests', () => {
  assert.equal(recognizeVoiceIntent('Show me the fastest route'), 'route');
  assert.equal(recognizeVoiceIntent('आश्रय दिखाइए'), 'shelters');
  assert.equal(recognizeVoiceIntent('माझे अहवाल दाखवा'), 'my-reports');
  assert.equal(recognizeVoiceIntent('Report waterlogging on this road'), 'submit-report');
  assert.equal(recognizeVoiceIntent('Send an SOS'), 'emergency');
  assert.equal(recognizeVoiceIntent('Emergency'), 'emergency');
  assert.equal(recognizeVoiceIntent('I need help'), 'emergency');
  assert.equal(recognizeVoiceIntent('Mala madat pahije'), 'emergency');
  assert.equal(recognizeVoiceIntent('Mujhe madad chahiye'), 'emergency');
  assert.equal(recognizeVoiceIntent('What are the latest emergency alerts?'), 'alerts');
  assert.equal(recognizeVoiceIntent('Is there danger near my location?'), 'alerts');
  assert.equal(recognizeVoiceIntent('Confirm'), 'confirm');
  assert.equal(recognizeVoiceIntent('Confirm SOS'), 'confirm');
  assert.equal(recognizeVoiceIntent('No'), 'cancel');
  assert.equal(recognizeVoiceIntent('Retry'), 'retry');
  assert.equal(recognizeVoiceIntent('Yesterday I called'), 'unknown');
  assert.equal(recognizeVoiceIntent('Stop'), 'cancel');
});

test('route mode and ordered place extraction use actual node names', () => {
  assert.equal(recognizeRouteMode('Show the shortest route'), 'shortest');
  assert.deepEqual(
    findMentionedNodes('Take me from Karve Nagar to Pune Railway Station', nodes).map(node => node.id),
    ['start', 'destination']
  );
  assert.deepEqual(findMentionedNodes('Go to an unknown location', nodes), []);
});

test('road matching chooses a known longest name only', () => {
  assert.equal(findRoadMention('There is waterlogging on Karve Road', ['Karve Road', 'Karve']), 'Karve Road');
  assert.equal(findRoadMention('There is waterlogging on an unknown road', ['Karve Road']), undefined);
  assert.equal(findRoadMention('Sinhagad Road is flooded', ['Sinhagad Road (Dandekar Bridge - Anand Nagar)', 'Sinhagad Road (Ekta Nagari - Dhayari)']), undefined);
  assert.equal(findRoadMention('Sinhagad Road Ekta Nagari - Dhayari is flooded', ['Sinhagad Road (Dandekar Bridge - Anand Nagar)', 'Sinhagad Road (Ekta Nagari - Dhayari)']), 'Sinhagad Road (Ekta Nagari - Dhayari)');
});

test('emergency contact matching uses directory names and multilingual aliases', () => {
  assert.deepEqual(
    matchEmergencyContacts('PMC Disaster Control ko call karo', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_01']
  );
  assert.deepEqual(
    matchEmergencyContacts('Call fire brigade', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_02']
  );
  assert.deepEqual(
    matchEmergencyContacts('रुग्णवाहिका फोन लावा', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_07']
  );
  assert.deepEqual(
    matchEmergencyContacts('Call PCMC Control Room', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_08']
  );
  assert.deepEqual(
    matchEmergencyContacts('Call fire and water rescue', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_02']
  );
  assert.deepEqual(
    matchEmergencyContacts('Call control room', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_01', 'EM_08']
  );
  assert.deepEqual(
    getRelevantEmergencyContacts('I need an ambulance', INITIAL_EMERGENCY_FACILITIES).map(contact => contact.id),
    ['EM_07']
  );
  assert.equal(
    getRelevantEmergencyContacts('I need help', INITIAL_EMERGENCY_FACILITIES).length,
    INITIAL_EMERGENCY_FACILITIES.length
  );
});

test('emergency phone parsing retains actual dialable alternatives', () => {
  assert.deepEqual(
    getEmergencyDialNumbers('101 / +91-20-26451707'),
    ['101', '+912026451707']
  );
  assert.deepEqual(getEmergencyDialNumbers('108 (Toll Free)'), ['108']);
  for (const contact of INITIAL_EMERGENCY_FACILITIES) {
    assert.deepEqual(
      matchEmergencyContacts(contact.name, INITIAL_EMERGENCY_FACILITIES).map(match => match.id),
      [contact.id]
    );
    assert.ok(getEmergencyDialNumbers(contact.contact).length > 0, `${contact.name} must have a dialable directory number`);
  }
  assert.deepEqual(
    matchEmergencyContacts('Call a newly added municipal rescue contact', [{
      id: 'future',
      name: 'Municipal Rescue Contact',
      type: 'Rescue',
      contact: '112',
      specialization: 'Future directory entry',
      serviceHours: '24x7'
    }]).map(contact => contact.id),
    ['future']
  );
});
