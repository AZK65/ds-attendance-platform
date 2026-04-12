// Module 5 Exam Questions — 24 multiple choice questions
// Replace placeholder questions with real ones from the PowerPoint

export interface ExamQuestion {
  id: number
  question: string
  image?: string // URL or base64 of image
  options: string[] // 4 choices
  correctAnswer: number // index of correct option (0-3)
}

export const MODULE_5_QUESTIONS: ExamQuestion[] = [
  {
    id: 1,
    question: "What should you do when approaching a yellow traffic light?",
    options: [
      "Speed up to get through the intersection",
      "Stop if you can do so safely",
      "Ignore it and continue driving",
      "Honk your horn to warn others"
    ],
    correctAnswer: 1
  },
  {
    id: 2,
    question: "What is the minimum following distance recommended in normal driving conditions?",
    options: [
      "1 second",
      "2 seconds",
      "3 seconds",
      "5 seconds"
    ],
    correctAnswer: 1
  },
  {
    id: 3,
    question: "When can you pass another vehicle on the right?",
    options: [
      "Whenever you want",
      "When the vehicle ahead is turning left",
      "When driving on the highway",
      "Never"
    ],
    correctAnswer: 1
  },
  {
    id: 4,
    question: "What does a flashing red light mean?",
    options: [
      "Slow down and proceed with caution",
      "Stop completely, then proceed when safe",
      "Yield to oncoming traffic",
      "The traffic light is broken"
    ],
    correctAnswer: 1
  },
  {
    id: 5,
    question: "What is the speed limit in a school zone unless otherwise posted?",
    options: [
      "20 km/h",
      "30 km/h",
      "40 km/h",
      "50 km/h"
    ],
    correctAnswer: 1
  },
  {
    id: 6,
    question: "What should you do if you hear an emergency vehicle siren?",
    options: [
      "Speed up to get out of the way",
      "Stop immediately where you are",
      "Pull over to the right and stop",
      "Continue driving normally"
    ],
    correctAnswer: 2
  },
  {
    id: 7,
    question: "When must you use your headlights?",
    options: [
      "Only at night",
      "Only in rain",
      "30 minutes before sunset to 30 minutes after sunrise",
      "Only on highways"
    ],
    correctAnswer: 2
  },
  {
    id: 8,
    question: "What is the legal blood alcohol limit for new drivers in Quebec?",
    options: [
      "0.08%",
      "0.05%",
      "0.02%",
      "Zero (0.00%)"
    ],
    correctAnswer: 3
  },
  {
    id: 9,
    question: "What should you check before changing lanes?",
    options: [
      "Only your rearview mirror",
      "Only your side mirror",
      "Mirrors and blind spot",
      "Only the blind spot"
    ],
    correctAnswer: 2
  },
  {
    id: 10,
    question: "What does a solid white line between lanes mean?",
    options: [
      "You can change lanes freely",
      "Lane changes are discouraged",
      "Only left turns allowed",
      "Parking is allowed"
    ],
    correctAnswer: 1
  },
  {
    id: 11,
    question: "When approaching a stop sign at the same time as another vehicle, who has the right of way?",
    options: [
      "The vehicle on the left",
      "The vehicle on the right",
      "The larger vehicle",
      "The vehicle that arrived first"
    ],
    correctAnswer: 1
  },
  {
    id: 12,
    question: "What is the correct hand signal for a left turn?",
    options: [
      "Left arm extended straight out",
      "Left arm extended upward",
      "Left arm extended downward",
      "Right arm extended straight out"
    ],
    correctAnswer: 0
  },
  {
    id: 13,
    question: "What should you do when driving in heavy rain?",
    options: [
      "Turn on hazard lights and continue at normal speed",
      "Reduce speed and increase following distance",
      "Drive in the left lane for better visibility",
      "Turn off headlights to reduce glare"
    ],
    correctAnswer: 1
  },
  {
    id: 14,
    question: "What does a yield sign require you to do?",
    options: [
      "Stop completely",
      "Slow down and give way to traffic",
      "Speed up to merge",
      "Honk before proceeding"
    ],
    correctAnswer: 1
  },
  {
    id: 15,
    question: "When parking uphill with a curb, which way should you turn your wheels?",
    options: [
      "Away from the curb (left)",
      "Toward the curb (right)",
      "Keep them straight",
      "It doesn't matter"
    ],
    correctAnswer: 0
  },
  {
    id: 16,
    question: "What is the minimum distance you must park from a fire hydrant?",
    options: [
      "3 metres",
      "5 metres",
      "7 metres",
      "10 metres"
    ],
    correctAnswer: 1
  },
  {
    id: 17,
    question: "What should you do at a railway crossing with flashing lights?",
    options: [
      "Slow down and cross carefully",
      "Stop and wait until the lights stop flashing",
      "Speed up to cross before the train arrives",
      "Honk your horn and proceed"
    ],
    correctAnswer: 1
  },
  {
    id: 18,
    question: "What is the purpose of ABS (Anti-lock Braking System)?",
    options: [
      "To make the car stop faster",
      "To prevent wheels from locking during hard braking",
      "To reduce engine braking",
      "To improve fuel efficiency"
    ],
    correctAnswer: 1
  },
  {
    id: 19,
    question: "When should you use your turn signal?",
    options: [
      "Only when other cars are around",
      "At least 30 metres before turning",
      "Only on highways",
      "After you start turning"
    ],
    correctAnswer: 1
  },
  {
    id: 20,
    question: "What does a double solid yellow line mean?",
    options: [
      "Passing is allowed from both directions",
      "Passing is allowed from one direction",
      "No passing from either direction",
      "Parking is prohibited"
    ],
    correctAnswer: 2
  },
  {
    id: 21,
    question: "What should you do if your vehicle starts to skid?",
    options: [
      "Slam on the brakes",
      "Turn the steering wheel in the opposite direction of the skid",
      "Steer in the direction of the skid and ease off the gas",
      "Accelerate to regain control"
    ],
    correctAnswer: 2
  },
  {
    id: 22,
    question: "What is the speed limit on Quebec highways unless otherwise posted?",
    options: [
      "80 km/h",
      "90 km/h",
      "100 km/h",
      "110 km/h"
    ],
    correctAnswer: 2
  },
  {
    id: 23,
    question: "When must you stop for a school bus with flashing red lights?",
    options: [
      "Only when children are visible",
      "Only when you are behind the bus",
      "When traveling in any direction (unless divided highway)",
      "Only during school hours"
    ],
    correctAnswer: 2
  },
  {
    id: 24,
    question: "What is the most common cause of traffic accidents?",
    options: [
      "Vehicle mechanical failure",
      "Poor road conditions",
      "Human error (distracted/impaired driving)",
      "Weather conditions"
    ],
    correctAnswer: 2
  },
]

export const PASS_SCORE = 18
export const EXAM_DURATION_MINUTES = 60
export const TOTAL_QUESTIONS = 24

// Shuffle array using Fisher-Yates algorithm
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
