import { UserRoomAuthorizer } from './user-room.authorizer';

describe('UserRoomAuthorizer', () => {
  const authorizer = new UserRoomAuthorizer();

  it('allows a user to join their own room', async () => {
    await expect(authorizer.canJoin('u1', 'user:u1')).resolves.toBe(true);
  });

  it("denies a user from joining another user's room", async () => {
    await expect(authorizer.canJoin('u1', 'user:u2')).resolves.toBe(false);
  });

  it('denies rooms from other prefixes', async () => {
    await expect(authorizer.canJoin('u1', 'encounter:u1')).resolves.toBe(false);
  });

  it('denies malformed room keys', async () => {
    await expect(authorizer.canJoin('u1', 'invalid')).resolves.toBe(false);
  });
});
