import BigNumber from 'bignumber.js';
import TestPositionsJson from '../build/test-positions.json';

export const TEST_POSITIONS = TestPositionsJson.map(mapPositionFromJson);

function mapPositionFromJson(jsonPosition) {
  return {
    ...jsonPosition,
    position: new BigNumber(jsonPosition.principal),
    interestRate: new BigNumber(jsonPosition.interestRate),
    requiredDeposit: new BigNumber(jsonPosition.requiredDeposit),
    callTimeLimit: new BigNumber(jsonPosition.callTimeLimit),
    callTimestamp: new BigNumber(jsonPosition.callTimestamp),
    startTimestamp: new BigNumber(jsonPosition.startTimestamp),
    maxDuration: new BigNumber(jsonPosition.maxDuration),
    interestPeriod: new BigNumber(jsonPosition.interestPeriod),
  }
}
