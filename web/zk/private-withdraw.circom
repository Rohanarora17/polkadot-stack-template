pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";

template MerkleRoot(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal hashes[levels + 1];
    signal left[levels];
    signal right[levels];

    hashes[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        left[i] <== hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i]);

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

template PrivateWithdraw(levels) {
    signal input root;
    signal input nullifierHash;
    signal input scope;
    signal input context;

    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal commitment;

    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== scope;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== secret;
    commitment <== commitmentHasher.out;

    component tree = MerkleRoot(levels);
    tree.leaf <== commitment;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    tree.root === root;

    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== scope;
    nullifierHasher.inputs[1] <== nullifier;
    nullifierHasher.out === nullifierHash;

    // Bind the relayer quote / recipient context into the proof even though the
    // verifier only needs the field element itself as a public signal.
    component contextBinder = Poseidon(1);
    contextBinder.inputs[0] <== context;
}

component main { public [root, nullifierHash, scope, context] } = PrivateWithdraw(10);
