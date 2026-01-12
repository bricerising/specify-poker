export interface HandConfig {
  small_blind: number;
  big_blind: number;
  ante: number;
}

export interface ParticipantAction {
  street: string;
  action: string;
  amount: number;
  timestamp: Date;
}

export interface HandParticipant {
  seat_id: number;
  user_id: string;
  nickname: string;
  starting_stack: number;
  ending_stack: number;
  hole_cards: string[];
  actions: ParticipantAction[];
  result: string;
}

export interface Pot {
  amount: number;
  winners: string[];
}

export interface Winner {
  user_id: string;
  amount: number;
}

export interface HandRecord {
  hand_id: string;
  table_id: string;
  table_name: string;
  config: HandConfig;
  participants: HandParticipant[];
  community_cards: string[];
  pots: Pot[];
  winners: Winner[];
  started_at: Date;
  completed_at: Date;
  duration_ms: number;
}
