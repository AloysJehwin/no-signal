import {SessionState} from '../state/SessionState';

// Matches the shape expected by cloud/api/training.py:_build_conversation_learning_prompt
// which reads: {equipment_type, session_id, turns:[{role, content}, ...]}.
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationLog {
  session_id: string;
  equipment_type: string;
  turns: ConversationTurn[];
  ended_at: string;
  outcome: 'resolved' | 'deferred';
}

export const buildConversationLog = (session: SessionState): ConversationLog => {
  const turns: ConversationTurn[] = [];

  // Opening user turn: the raw symptom
  turns.push({role: 'user', content: `Symptom: ${session.symptomRaw}`});

  for (const step of session.attemptedSteps) {
    turns.push({
      role: 'assistant',
      content: `Hypothesis: ${step.hypothesis}. Suggested step: ${step.step}. Expected: ${step.expected}.`,
    });
    turns.push({
      role: 'user',
      content: `Reported: ${step.reported}. Result: ${step.match ? 'confirmed' : 'ruled out'}.`,
    });
  }

  if (session.currentHypothesis && !session.attemptedSteps.some(s => s.hypothesis === session.currentHypothesis)) {
    turns.push({
      role: 'assistant',
      content: `Leading hypothesis at handoff: ${session.currentHypothesis} (confidence ${session.confidence.toFixed(2)}).`,
    });
  }

  return {
    session_id: session.sessionId,
    equipment_type: session.equipmentType,
    turns,
    ended_at: new Date().toISOString(),
    outcome: session.status === 'resolved' ? 'resolved' : 'deferred',
  };
};
