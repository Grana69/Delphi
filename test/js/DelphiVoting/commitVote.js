/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: commitVote', () => {
    const [staker, arbiter, claimant, bob] = accounts;

    before(async () => {
      // Add an arbiter to the whitelist
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should initialize a new claim and log the arbiter\'s vote', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      // Set constants
      const CLAIM_AMOUNT = '10';
      const FEE_AMOUNT = '5';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim in the DelphiStake and generate a claim ID
      const claimNumber = // should be zero, since this is the first test
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats');
      const claimId = utils.getClaimId(DelphiStake.address, claimNumber.toString(10));

      // Nobody has voted yet for the new claim, so from the DelphiVoting contract's perpective,
      // this claim does not exist.
      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');

      // Generate a secret hash and, as the arbiter, commit it for the claim which was just opened
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      // Now, because an arbiter has voted, a claim should exist in the eyes of the DV contract
      const finalClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(finalClaimExists, true, 'The claim was not instantiated');

      // Lets also make sure the secret hash which was stored was the same which we committed.
      const storedSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(storedSecretHash, secretHash, 'The vote was not properly stored');
    });

    it('should update an arbiter\'s vote in a claim', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      // Set constants
      const CLAIM_NUMBER = '0'; // Use previous claim number
      const VOTE = '2'; // Previous commit by this arbiter in this claim was for 2
      const SALT = '420';

      // Generate a new secretHash and compute the claim ID
      const secretHash = utils.getSecretHash(VOTE, SALT);
      const claimId = utils.getClaimId(DelphiStake.address, CLAIM_NUMBER);

      // Capture the initial secret hash and make sure it is not the same as our new secret hash
      const initialSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.notEqual(initialSecretHash, secretHash);

      // As the arbiter, commit the new secret hash
      await utils.as(arbiter, dv.commitVote, ds.address, CLAIM_NUMBER, secretHash);

      // The final secret hash should be different than the initial secret hash
      const finalSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(finalSecretHash, secretHash);
    });

    it('should not allow a non-arbiter to vote', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      // Set constants
      const CLAIM_NUMBER = '0'; // Use previous claim number
      const VOTE = '1';
      const SALT = '420';

      // Generate a secret hash
      const secretHash = utils.getSecretHash(VOTE, SALT);

      try {
        // As bob, who is not an arbiter, attempt to commit a vote
        await utils.as(bob, dv.commitVote, ds.address, CLAIM_NUMBER, secretHash);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'should not have been able to vote as non-arbiter');
    });

    it('should not allow an arbiter to commit after the commit period has ended');

    it('should not allow an arbiter to commit a vote for a claim which does not exist',
      async () => {
        const dv = await DelphiVoting.deployed();
        const ds = await DelphiStake.deployed();

        // Set constants
        const NON_EXISTANT_CLAIM = '420';
        const SALT = '420';
        const VOTE_CHOICE = '1';

        // Generate a secret hash
        const secretHash = utils.getSecretHash(VOTE_CHOICE, SALT);

        try {
          // As the arbiter, try to commit a vote for a claim which does not exist in the DS
          await utils.as(arbiter, dv.commitVote, ds.address, NON_EXISTANT_CLAIM, secretHash);
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());
          return;
        }
        assert(false, 'should not have been able to vote in an uninitialized claim');
      },
    );

    it('should not allow an arbiter to commit a secret hash of 0');
  });
});

