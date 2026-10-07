import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuestClientError, verifyClaim } from '../client';
import { useClaimQueue } from '../claimQueue';

vi.mock('../client', () => {
    class QuestClientError extends Error {
        readonly code: string;
        readonly status?: number;
        readonly authReason?: string;

        constructor(code: string, message: string, status?: number, authReason?: string) {
            super(message);
            this.name = 'QuestClientError';
            this.code = code;
            this.status = status;
            this.authReason = authReason;
        }
    }
    return { QuestClientError, verifyClaim: vi.fn() };
});

const verifyMock = vi.mocked(verifyClaim);

const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DAY = '2026-09-30';

function makeClaim(questId = 'quest-1') {
    return { wallet: WALLET, day: DAY, questId };
}

beforeEach(() => {
    useClaimQueue.setState({ pending: [], failed: [] });
    verifyMock.mockReset();
});

describe('claimQueue transient rejections', () => {
    it('keeps a conditions_not_met claim queued with incremented attempts and backoff', async () => {
        verifyMock.mockResolvedValue({ credited: false, reason: 'conditions_not_met' });
        useClaimQueue.getState().enqueue(makeClaim());

        const res = await useClaimQueue.getState().flush();

        expect(res).toMatchObject({ credited: 0, failed: 0, remaining: 1 });
        const [claim] = useClaimQueue.getState().pending;
        expect(claim.attempts).toBe(1);
        expect(claim.firstSeenAt).toBeGreaterThan(0);
        expect(claim.nextAttemptAt).toBeGreaterThan(Date.now());
        expect(useClaimQueue.getState().failed).toHaveLength(0);
    });

    it('treats unknown_quest as retryable too', async () => {
        verifyMock.mockResolvedValue({ credited: false, reason: 'unknown_quest' });
        useClaimQueue.getState().enqueue(makeClaim());

        await useClaimQueue.getState().flush();

        expect(useClaimQueue.getState().failed).toHaveLength(0);
        expect(useClaimQueue.getState().pending[0].attempts).toBe(1);
    });

    it('skips claims whose backoff window has not elapsed', async () => {
        verifyMock.mockResolvedValue({ credited: false, reason: 'conditions_not_met' });
        useClaimQueue.getState().enqueue(makeClaim());

        await useClaimQueue.getState().flush();
        const res = await useClaimQueue.getState().flush();

        expect(verifyMock).toHaveBeenCalledTimes(1);
        expect(res.remaining).toBe(1);
    });

    it('moves a claim to failed once it hits the attempt cap', async () => {
        verifyMock.mockResolvedValue({ credited: false, reason: 'conditions_not_met' });
        useClaimQueue
            .getState()
            .enqueue({ ...makeClaim(), attempts: 19, firstSeenAt: Date.now() });

        const res = await useClaimQueue.getState().flush();

        expect(res.failed).toBe(1);
        expect(useClaimQueue.getState().pending).toHaveLength(0);
        const [failed] = useClaimQueue.getState().failed;
        expect(failed.reason).toBe('conditions_not_met');
        expect(failed.attempts).toBe(19);
    });

    it('moves a claim to failed once it is older than 48h', async () => {
        verifyMock.mockResolvedValue({ credited: false, reason: 'unknown_quest' });
        useClaimQueue
            .getState()
            .enqueue({ ...makeClaim(), firstSeenAt: Date.now() - 49 * 3_600_000 });

        await useClaimQueue.getState().flush();

        expect(useClaimQueue.getState().pending).toHaveLength(0);
        expect(useClaimQueue.getState().failed[0].reason).toBe('unknown_quest');
    });
});

describe('claimQueue definitive failures', () => {
    it('fails bad_signature immediately without consuming attempts', async () => {
        verifyMock.mockRejectedValue(
            new QuestClientError('auth', 'rejected', 401, 'bad_signature'),
        );
        useClaimQueue.getState().enqueue(makeClaim());

        await useClaimQueue.getState().flush();

        expect(useClaimQueue.getState().pending).toHaveLength(0);
        expect(useClaimQueue.getState().failed[0].reason).toBe('bad_signature');
    });

    it('fails a bare 401 from the bearer gate', async () => {
        verifyMock.mockRejectedValue(new QuestClientError('http', 'nope', 401));
        useClaimQueue.getState().enqueue(makeClaim());

        await useClaimQueue.getState().flush();

        expect(useClaimQueue.getState().failed[0].reason).toBe('unauthorized');
    });

    it('keeps signer errors queued without consuming an attempt', async () => {
        verifyMock.mockRejectedValue(new QuestClientError('signer', 'declined'));
        useClaimQueue.getState().enqueue(makeClaim());

        const res = await useClaimQueue.getState().flush();

        expect(res.remaining).toBe(1);
        expect(useClaimQueue.getState().failed).toHaveLength(0);
        expect(useClaimQueue.getState().pending[0].attempts).toBe(0);
    });

    it('keeps network errors queued without consuming an attempt', async () => {
        verifyMock.mockRejectedValue(new QuestClientError('network', 'unreachable'));
        useClaimQueue.getState().enqueue(makeClaim());

        await useClaimQueue.getState().flush();

        expect(useClaimQueue.getState().pending[0].attempts).toBe(0);
    });
});

describe('claimQueue credits and retries', () => {
    it('drops a credited claim from the queue', async () => {
        verifyMock.mockResolvedValue({
            credited: true,
            xp: 25,
            questId: 'quest-1',
            duplicate: false,
            flagged: false,
        });
        useClaimQueue.getState().enqueue(makeClaim());

        const res = await useClaimQueue.getState().flush();

        expect(res).toMatchObject({ credited: 1, failed: 0, remaining: 0 });
    });

    it('retryFailed requeues failed claims with a fresh retry budget', () => {
        useClaimQueue.setState({
            failed: [
                {
                    ...makeClaim(),
                    attempts: 20,
                    firstSeenAt: Date.now() - 86_400_000,
                    nextAttemptAt: Date.now() + 3_600_000,
                    reason: 'conditions_not_met',
                    failedAt: Date.now(),
                },
                {
                    ...makeClaim('quest-2'),
                    attempts: 1,
                    firstSeenAt: Date.now(),
                    reason: 'bad_signature',
                    failedAt: Date.now(),
                },
            ],
        });

        const moved = useClaimQueue.getState().retryFailed(WALLET);

        expect(moved).toBe(2);
        const state = useClaimQueue.getState();
        expect(state.failed).toHaveLength(0);
        expect(state.pending).toHaveLength(2);
        for (const claim of state.pending) {
            expect(claim.attempts).toBe(0);
            expect(claim.nextAttemptAt).toBeUndefined();
        }
    });

    it('retryFailed can target a single quest', () => {
        useClaimQueue.setState({
            failed: [
                {
                    ...makeClaim(),
                    attempts: 20,
                    firstSeenAt: Date.now(),
                    reason: 'conditions_not_met',
                    failedAt: Date.now(),
                },
                {
                    ...makeClaim('quest-2'),
                    attempts: 1,
                    firstSeenAt: Date.now(),
                    reason: 'bad_signature',
                    failedAt: Date.now(),
                },
            ],
        });

        const moved = useClaimQueue.getState().retryFailed(WALLET, 'quest-2');

        expect(moved).toBe(1);
        const state = useClaimQueue.getState();
        expect(state.failed).toHaveLength(1);
        expect(state.failed[0].questId).toBe('quest-1');
        expect(state.pending[0].questId).toBe('quest-2');
    });

    it('sends kind/programId content hints on the wire body', async () => {
        verifyMock.mockResolvedValue({
            credited: true,
            xp: 25,
            questId: 'quest-1',
            duplicate: false,
            flagged: false,
        });
        useClaimQueue
            .getState()
            .enqueue({ ...makeClaim(), kind: 'count', programId: 'prog-1' });

        await useClaimQueue.getState().flush();

        expect(verifyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                wallet: WALLET,
                day: DAY,
                questId: 'quest-1',
                kind: 'count',
                programId: 'prog-1',
            }),
        );
        // Retry metadata is queue-local and never leaks onto the wire.
        const wire = verifyMock.mock.calls[0][0];
        expect(wire).not.toHaveProperty('attempts');
        expect(wire).not.toHaveProperty('firstSeenAt');
        expect(wire).not.toHaveProperty('nextAttemptAt');
    });
});

describe('claimQueue prepareRetry', () => {
    it('drops matching failed entries and enqueues fresh', () => {
        useClaimQueue.setState({
            failed: [
                {
                    ...makeClaim(),
                    attempts: 20,
                    firstSeenAt: Date.now(),
                    reason: 'conditions_not_met',
                    failedAt: Date.now(),
                },
                {
                    ...makeClaim('quest-2'),
                    attempts: 1,
                    firstSeenAt: Date.now(),
                    reason: 'bad_signature',
                    failedAt: Date.now(),
                },
            ],
        });

        useClaimQueue.getState().prepareRetry(makeClaim());

        const state = useClaimQueue.getState();
        expect(state.failed).toHaveLength(1);
        expect(state.failed[0].questId).toBe('quest-2');
        expect(state.pending).toHaveLength(1);
        expect(state.pending[0].questId).toBe('quest-1');
        expect(state.pending[0].attempts).toBe(0);
    });

    it('resets the retry budget of a matching pending claim, preserving its signature', () => {
        useClaimQueue.setState({
            pending: [
                {
                    ...makeClaim(),
                    signature: 'sig-123',
                    attempts: 5,
                    firstSeenAt: Date.now() - 3_600_000,
                    nextAttemptAt: Date.now() + 3_600_000,
                },
            ],
        });

        useClaimQueue.getState().prepareRetry(makeClaim());

        const state = useClaimQueue.getState();
        expect(state.pending).toHaveLength(1);
        const [claim] = state.pending;
        expect(claim.attempts).toBe(0);
        expect(claim.nextAttemptAt).toBeUndefined();
        expect(claim.signature).toBe('sig-123');
    });

    it('enqueues the claim when nothing matches', () => {
        useClaimQueue.getState().prepareRetry(makeClaim());

        const state = useClaimQueue.getState();
        expect(state.failed).toHaveLength(0);
        expect(state.pending).toHaveLength(1);
        expect(state.pending[0].attempts).toBe(0);
        expect(state.pending[0].nextAttemptAt).toBeUndefined();
    });
});
