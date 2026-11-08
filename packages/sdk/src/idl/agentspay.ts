/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/agentspay.json`.
 */
export type Agentspay = {
  "address": "EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT",
  "metadata": {
    "name": "agentspay",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Attestation-gated, metered payments for AI agents on Solana",
    "repository": "https://github.com/maitreya-ai/AgentsPay-Sol"
  },
  "instructions": [
    {
      "name": "approveAttestation",
      "discriminator": [
        164,
        8,
        113,
        205,
        196,
        52,
        40,
        168
      ],
      "accounts": [
        {
          "name": "verifier",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "attestation"
          ]
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "measurement"
        }
      ],
      "args": []
    },
    {
      "name": "approveMeasurement",
      "discriminator": [
        58,
        224,
        184,
        35,
        28,
        100,
        43,
        202
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "measurement",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "measurementArgs"
            }
          }
        }
      ]
    },
    {
      "name": "buyCredits",
      "discriminator": [
        14,
        173,
        58,
        38,
        248,
        235,
        115,
        102
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offering",
          "writable": true
        },
        {
          "name": "provider",
          "relations": [
            "offering",
            "attestation"
          ]
        },
        {
          "name": "attestation"
        },
        {
          "name": "measurement"
        },
        {
          "name": "creditMint",
          "writable": true,
          "relations": [
            "offering"
          ]
        },
        {
          "name": "buyerCredits",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "creditTokenProgram"
              },
              {
                "kind": "account",
                "path": "creditMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentMint",
          "relations": [
            "offering"
          ]
        },
        {
          "name": "buyerPayment",
          "writable": true
        },
        {
          "name": "offeringEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "offering"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creditTokenProgram"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cashOutCredits",
      "discriminator": [
        224,
        233,
        36,
        143,
        8,
        24,
        92,
        58
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offering"
        },
        {
          "name": "provider",
          "relations": [
            "offering"
          ]
        },
        {
          "name": "attestation",
          "docs": [
            "Required by `refund_credits` when the provider has an active attestation."
          ],
          "optional": true
        },
        {
          "name": "measurement",
          "optional": true
        },
        {
          "name": "creditMint",
          "writable": true,
          "relations": [
            "offering"
          ]
        },
        {
          "name": "holderCredits",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "offering"
          ]
        },
        {
          "name": "offeringEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "offering"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "holderPayment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creditTokenProgram"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeSession",
      "discriminator": [
        68,
        114,
        178,
        140,
        222,
        38,
        248,
        211
      ],
      "accounts": [
        {
          "name": "closer",
          "writable": true,
          "signer": true
        },
        {
          "name": "session",
          "writable": true
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "session"
          ]
        },
        {
          "name": "attestation",
          "relations": [
            "session"
          ]
        },
        {
          "name": "measurement"
        },
        {
          "name": "mint",
          "relations": [
            "session"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "session"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "refundOwner"
        },
        {
          "name": "refundToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "refundOwner"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createOffering",
      "discriminator": [
        48,
        254,
        213,
        82,
        85,
        141,
        15,
        220
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "provider",
          "writable": true
        },
        {
          "name": "offering",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              },
              {
                "kind": "account",
                "path": "provider.offeringCount",
                "account": "provider"
              }
            ]
          }
        },
        {
          "name": "creditMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offering"
              }
            ]
          }
        },
        {
          "name": "paymentMint"
        },
        {
          "name": "offeringEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "offering"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creditTokenProgram"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createOfferingArgs"
            }
          }
        }
      ]
    },
    {
      "name": "createVault",
      "discriminator": [
        29,
        237,
        247,
        208,
        193,
        82,
        54,
        135
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "agent"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vaultToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "agent",
          "type": "pubkey"
        },
        {
          "name": "policy",
          "type": {
            "defined": {
              "name": "vaultPolicy"
            }
          }
        }
      ]
    },
    {
      "name": "finalizeSession",
      "discriminator": [
        34,
        148,
        144,
        47,
        37,
        130,
        206,
        161
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "session",
          "writable": true
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "session"
          ]
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "vault",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "rating",
          "type": {
            "option": "u8"
          }
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "openSession",
      "discriminator": [
        130,
        54,
        124,
        7,
        236,
        20,
        104,
        104
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "attestation"
          ]
        },
        {
          "name": "attestation"
        },
        {
          "name": "measurement"
        },
        {
          "name": "mint"
        },
        {
          "name": "payerToken",
          "writable": true
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "provider"
              },
              {
                "kind": "arg",
                "path": "args.salt"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "session"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "openSessionArgs"
            }
          }
        }
      ]
    },
    {
      "name": "openSessionFromVault",
      "discriminator": [
        59,
        6,
        171,
        196,
        28,
        183,
        29,
        17
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "attestation"
          ]
        },
        {
          "name": "attestation"
        },
        {
          "name": "measurement"
        },
        {
          "name": "mint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "provider"
              },
              {
                "kind": "arg",
                "path": "args.salt"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "session"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "openSessionArgs"
            }
          }
        }
      ]
    },
    {
      "name": "refundCredits",
      "discriminator": [
        49,
        69,
        89,
        151,
        183,
        85,
        37,
        85
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offering"
        },
        {
          "name": "provider",
          "relations": [
            "offering"
          ]
        },
        {
          "name": "attestation",
          "docs": [
            "Required by `refund_credits` when the provider has an active attestation."
          ],
          "optional": true
        },
        {
          "name": "measurement",
          "optional": true
        },
        {
          "name": "creditMint",
          "writable": true,
          "relations": [
            "offering"
          ]
        },
        {
          "name": "holderCredits",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "offering"
          ]
        },
        {
          "name": "offeringEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "offering"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "holderPayment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creditTokenProgram"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerProvider",
      "discriminator": [
        254,
        209,
        54,
        184,
        46,
        197,
        109,
        78
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "registerProviderArgs"
            }
          }
        }
      ]
    },
    {
      "name": "requestClose",
      "discriminator": [
        82,
        168,
        167,
        86,
        14,
        15,
        199,
        180
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "session",
          "writable": true
        },
        {
          "name": "vault",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "revokeAttestation",
      "discriminator": [
        12,
        156,
        103,
        161,
        194,
        246,
        211,
        179
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "attestation"
          ]
        },
        {
          "name": "attestation",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "u8"
        }
      ]
    },
    {
      "name": "revokeMeasurement",
      "discriminator": [
        229,
        203,
        215,
        114,
        74,
        160,
        21,
        201
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "measurement",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Anyone can crank a settlement; funds only ever flow to the provider",
            "payout and the treasury, bounded by both signatures."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "session",
          "writable": true
        },
        {
          "name": "provider",
          "writable": true,
          "relations": [
            "session"
          ]
        },
        {
          "name": "attestation",
          "relations": [
            "session"
          ]
        },
        {
          "name": "measurement"
        },
        {
          "name": "mint",
          "relations": [
            "session"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "session"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "payout"
        },
        {
          "name": "payoutToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasury"
        },
        {
          "name": "treasuryToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "submitAttestation",
      "discriminator": [
        238,
        220,
        255,
        105,
        183,
        211,
        40,
        83
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "provider"
        },
        {
          "name": "attestation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  115,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              },
              {
                "kind": "arg",
                "path": "args.enclaveKey"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "submitAttestationArgs"
            }
          }
        }
      ]
    },
    {
      "name": "topUpSession",
      "discriminator": [
        38,
        46,
        22,
        233,
        201,
        167,
        226,
        28
      ],
      "accounts": [
        {
          "name": "funder",
          "signer": true
        },
        {
          "name": "session",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "session"
          ]
        },
        {
          "name": "funderToken",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "session"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateConfigArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateProvider",
      "discriminator": [
        52,
        208,
        141,
        191,
        164,
        54,
        108,
        150
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "provider",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateProviderArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateVault",
      "discriminator": [
        67,
        229,
        185,
        188,
        226,
        11,
        210,
        60
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateVaultArgs"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawVault",
      "discriminator": [
        135,
        7,
        237,
        120,
        149,
        94,
        95,
        7
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vaultToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentVault",
      "discriminator": [
        232,
        220,
        237,
        164,
        157,
        9,
        215,
        194
      ]
    },
    {
      "name": "attestation",
      "discriminator": [
        152,
        125,
        183,
        86,
        36,
        146,
        121,
        73
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "measurement",
      "discriminator": [
        102,
        58,
        48,
        155,
        68,
        220,
        172,
        169
      ]
    },
    {
      "name": "offering",
      "discriminator": [
        128,
        234,
        9,
        226,
        125,
        227,
        146,
        39
      ]
    },
    {
      "name": "provider",
      "discriminator": [
        164,
        180,
        71,
        17,
        75,
        216,
        80,
        195
      ]
    },
    {
      "name": "session",
      "discriminator": [
        243,
        81,
        72,
        115,
        214,
        188,
        72,
        144
      ]
    }
  ],
  "events": [
    {
      "name": "attestationApproved",
      "discriminator": [
        255,
        78,
        5,
        7,
        48,
        95,
        217,
        2
      ]
    },
    {
      "name": "attestationRevoked",
      "discriminator": [
        47,
        106,
        65,
        238,
        200,
        127,
        163,
        50
      ]
    },
    {
      "name": "attestationSubmitted",
      "discriminator": [
        177,
        213,
        117,
        225,
        166,
        11,
        54,
        218
      ]
    },
    {
      "name": "attestationValidated",
      "discriminator": [
        182,
        201,
        52,
        19,
        35,
        106,
        132,
        254
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "creditsPurchased",
      "discriminator": [
        176,
        67,
        39,
        167,
        11,
        116,
        222,
        22
      ]
    },
    {
      "name": "creditsRedeemed",
      "discriminator": [
        70,
        107,
        246,
        102,
        178,
        30,
        15,
        17
      ]
    },
    {
      "name": "measurementSet",
      "discriminator": [
        132,
        246,
        156,
        114,
        49,
        54,
        238,
        134
      ]
    },
    {
      "name": "offeringCreated",
      "discriminator": [
        170,
        79,
        82,
        53,
        14,
        186,
        174,
        70
      ]
    },
    {
      "name": "paidFeedback",
      "discriminator": [
        240,
        232,
        180,
        47,
        240,
        152,
        169,
        167
      ]
    },
    {
      "name": "providerRegistered",
      "discriminator": [
        38,
        209,
        137,
        78,
        185,
        19,
        147,
        14
      ]
    },
    {
      "name": "providerUpdated",
      "discriminator": [
        143,
        4,
        27,
        180,
        122,
        208,
        164,
        136
      ]
    },
    {
      "name": "sessionCloseRequested",
      "discriminator": [
        53,
        166,
        161,
        43,
        210,
        141,
        144,
        107
      ]
    },
    {
      "name": "sessionClosed",
      "discriminator": [
        57,
        237,
        11,
        243,
        194,
        34,
        120,
        27
      ]
    },
    {
      "name": "sessionOpened",
      "discriminator": [
        34,
        79,
        77,
        95,
        195,
        207,
        104,
        223
      ]
    },
    {
      "name": "sessionSettled",
      "discriminator": [
        127,
        161,
        59,
        136,
        23,
        168,
        191,
        149
      ]
    },
    {
      "name": "sessionToppedUp",
      "discriminator": [
        3,
        83,
        18,
        81,
        116,
        179,
        58,
        150
      ]
    },
    {
      "name": "vaultCreated",
      "discriminator": [
        117,
        25,
        120,
        254,
        75,
        236,
        78,
        115
      ]
    },
    {
      "name": "vaultUpdated",
      "discriminator": [
        93,
        187,
        145,
        216,
        134,
        201,
        3,
        105
      ]
    },
    {
      "name": "vaultWithdrawn",
      "discriminator": [
        238,
        9,
        219,
        172,
        188,
        77,
        72,
        104
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorized for this action"
    },
    {
      "code": 6001,
      "name": "invalidVerifierSet",
      "msg": "Verifier set is empty, too large, or contains duplicates"
    },
    {
      "code": 6002,
      "name": "invalidThreshold",
      "msg": "Verifier threshold must be between 1 and the number of verifiers"
    },
    {
      "code": 6003,
      "name": "feeTooHigh",
      "msg": "Protocol fee exceeds the maximum"
    },
    {
      "code": 6004,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6005,
      "name": "stringTooLong",
      "msg": "String exceeds maximum length"
    },
    {
      "code": 6006,
      "name": "invalidTeeType",
      "msg": "Unknown TEE type"
    },
    {
      "code": 6007,
      "name": "simulatedTeeDisabled",
      "msg": "Simulated TEE attestations are disabled on this deployment"
    },
    {
      "code": 6008,
      "name": "measurementNotApproved",
      "msg": "Workload measurement is not approved"
    },
    {
      "code": 6009,
      "name": "attestationNotPending",
      "msg": "Attestation is not pending"
    },
    {
      "code": 6010,
      "name": "attestationNotValid",
      "msg": "Attestation is not valid (revoked, expired, or measurement revoked)"
    },
    {
      "code": 6011,
      "name": "alreadyApproved",
      "msg": "Verifier already approved this attestation"
    },
    {
      "code": 6012,
      "name": "notVerifier",
      "msg": "Signer is not a registered verifier"
    },
    {
      "code": 6013,
      "name": "invalidTtl",
      "msg": "Invalid attestation time-to-live"
    },
    {
      "code": 6014,
      "name": "notActiveAttestation",
      "msg": "Attestation is not the provider's active attestation"
    },
    {
      "code": 6015,
      "name": "enclaveKeyIsOperator",
      "msg": "Enclave key must differ from the operator key"
    },
    {
      "code": 6016,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6017,
      "name": "invalidPrice",
      "msg": "Price per unit must be greater than zero"
    },
    {
      "code": 6018,
      "name": "invalidGracePeriod",
      "msg": "Grace period out of bounds"
    },
    {
      "code": 6019,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6020,
      "name": "sessionNotOpen",
      "msg": "Session is not open"
    },
    {
      "code": 6021,
      "name": "sessionNotClosed",
      "msg": "Session is not closed"
    },
    {
      "code": 6022,
      "name": "sessionNotSettleable",
      "msg": "Session can no longer be settled (grace period elapsed)"
    },
    {
      "code": 6023,
      "name": "closeNotAllowed",
      "msg": "Session cannot be closed yet"
    },
    {
      "code": 6024,
      "name": "escrowShortfall",
      "msg": "Escrow balance is lower than the recorded deposit"
    },
    {
      "code": 6025,
      "name": "missingEd25519Instruction",
      "msg": "Expected Ed25519 precompile instruction is missing"
    },
    {
      "code": 6026,
      "name": "invalidEd25519Instruction",
      "msg": "Ed25519 precompile instruction is not in canonical single-signature form"
    },
    {
      "code": 6027,
      "name": "signerMismatch",
      "msg": "Signed message was signed by an unexpected key"
    },
    {
      "code": 6028,
      "name": "invalidMessage",
      "msg": "Signed message is malformed"
    },
    {
      "code": 6029,
      "name": "voucherSessionMismatch",
      "msg": "Voucher targets a different session"
    },
    {
      "code": 6030,
      "name": "voucherExpired",
      "msg": "Voucher has expired"
    },
    {
      "code": 6031,
      "name": "receiptSessionMismatch",
      "msg": "Usage receipt targets a different session"
    },
    {
      "code": 6032,
      "name": "receiptRegressed",
      "msg": "Usage receipt units went backwards"
    },
    {
      "code": 6033,
      "name": "nothingToSettle",
      "msg": "Nothing to settle"
    },
    {
      "code": 6034,
      "name": "vaultFrozen",
      "msg": "Vault is frozen by its owner"
    },
    {
      "code": 6035,
      "name": "vaultExpired",
      "msg": "Vault policy has expired"
    },
    {
      "code": 6036,
      "name": "sessionDepositTooLarge",
      "msg": "Session deposit exceeds the vault's per-session cap"
    },
    {
      "code": 6037,
      "name": "periodLimitExceeded",
      "msg": "Vault spending limit for the current period would be exceeded"
    },
    {
      "code": 6038,
      "name": "providerRatingTooLow",
      "msg": "Provider rating is below the vault's minimum"
    },
    {
      "code": 6039,
      "name": "teeTypeNotAllowed",
      "msg": "Provider's TEE type is not allowed by the vault policy"
    },
    {
      "code": 6040,
      "name": "vaultMismatch",
      "msg": "Vault account missing or does not match the session"
    },
    {
      "code": 6041,
      "name": "offeringExpired",
      "msg": "Offering has expired"
    },
    {
      "code": 6042,
      "name": "offeringSoldOut",
      "msg": "Offering supply cap reached"
    },
    {
      "code": 6043,
      "name": "refundNotAllowed",
      "msg": "Credits can only be refunded after expiry or when the provider has no valid attestation"
    },
    {
      "code": 6044,
      "name": "notCashOutAuthority",
      "msg": "Only the provider payout wallet or the treasury can cash out credits"
    },
    {
      "code": 6045,
      "name": "invalidRating",
      "msg": "Rating must be between 0 and 100"
    },
    {
      "code": 6046,
      "name": "nothingToRate",
      "msg": "Only sessions with settled payment can be rated"
    }
  ],
  "types": [
    {
      "name": "agentVault",
      "docs": [
        "Owner-funded budget an agent can spend from under a policy, without the",
        "owner signing every session. The owner can freeze or drain it at any time."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "maxPerSession",
            "type": "u64"
          },
          {
            "name": "periodLimit",
            "docs": [
              "Max deposits per rolling period; ignored when `period_seconds == 0`."
            ],
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u32"
          },
          {
            "name": "periodStart",
            "type": "i64"
          },
          {
            "name": "periodSpent",
            "type": "u64"
          },
          {
            "name": "minProviderRating",
            "docs": [
              "Minimum paid-feedback average (0 disables the check)."
            ],
            "type": "u8"
          },
          {
            "name": "allowedTeeMask",
            "docs": [
              "Bit i set = `TeeType` i allowed. 0 = any non-simulated type allowed by config."
            ],
            "type": "u16"
          },
          {
            "name": "expiresAt",
            "docs": [
              "Unix timestamp after which the agent can no longer open sessions (0 = never)."
            ],
            "type": "i64"
          },
          {
            "name": "frozen",
            "type": "bool"
          },
          {
            "name": "openSessions",
            "type": "u32"
          },
          {
            "name": "lifetimeSettled",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "attestation",
      "docs": [
        "Hardware attestation binding an enclave-held key to an approved workload.",
        "",
        "The TEE quote's `REPORTDATA` must commit to",
        "`sha256(\"agentspay:attest:v1\" || provider || enclave_key || encryption_key)`",
        "so the verifiers can prove the keys were generated inside the enclave."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "enclaveKey",
            "docs": [
              "Ed25519 key that never leaves the enclave; signs usage receipts."
            ],
            "type": "pubkey"
          },
          {
            "name": "encryptionKey",
            "docs": [
              "X25519 key for sealing prompts to the enclave (private inference)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "teeType",
            "type": "u8"
          },
          {
            "name": "measurement",
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "evidenceHash",
            "docs": [
              "SHA-256 of the raw evidence bundle (quote + GPU report + collateral)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "evidenceUri",
            "type": "string"
          },
          {
            "name": "requestedTtl",
            "type": "i64"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "verifiedAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "approvals",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "attestationApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "verifier",
            "type": "pubkey"
          },
          {
            "name": "approvals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "attestationRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "revokedBy",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "attestationSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "enclaveKey",
            "type": "pubkey"
          },
          {
            "name": "teeType",
            "type": "u8"
          },
          {
            "name": "measurement",
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "attestationValidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "enclaveKey",
            "type": "pubkey"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Global protocol configuration (singleton PDA)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Wallet that owns protocol-fee token accounts."
            ],
            "type": "pubkey"
          },
          {
            "name": "verifiers",
            "docs": [
              "Attestation verifier committee."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "verifierThreshold",
            "docs": [
              "Approvals required to mark an attestation valid."
            ],
            "type": "u8"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "maxAttestationTtl",
            "docs": [
              "Upper bound on attestation lifetime (seconds)."
            ],
            "type": "i64"
          },
          {
            "name": "allowSimulatedTee",
            "docs": [
              "Allow `TeeType::Simulated` (localnet / devnet only)."
            ],
            "type": "bool"
          },
          {
            "name": "paused",
            "docs": [
              "Blocks new sessions / credit sales. Exits always stay open."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "verifierCount",
            "type": "u8"
          },
          {
            "name": "verifierThreshold",
            "type": "u8"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "createOfferingArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pricePerCredit",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "unit",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "creditsPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offering",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "credits",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "creditsRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offering",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "credits",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "refund",
            "docs": [
              "true = default refund to a holder, false = provider/treasury cash-out."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "initializeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "verifiers",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "verifierThreshold",
            "type": "u8"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "maxAttestationTtl",
            "type": "i64"
          },
          {
            "name": "allowSimulatedTee",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "measurement",
      "docs": [
        "Governance-approved workload measurement: a reproducible build of the",
        "inference server + model weights that providers are allowed to run.",
        "Revoking a measurement instantly invalidates every attestation that",
        "carries it (e.g. after a CVE or TCB recall)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "teeType",
            "type": "u8"
          },
          {
            "name": "value",
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "modelHash",
            "docs": [
              "SHA-256 of the model weights / manifest served by this workload."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "label",
            "type": "string"
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "measurementArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "teeType",
            "type": "u8"
          },
          {
            "name": "value",
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "modelHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "label",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "measurementSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "measurement",
            "type": "pubkey"
          },
          {
            "name": "teeType",
            "type": "u8"
          },
          {
            "name": "value",
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "modelHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "approved",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "offering",
      "docs": [
        "Tokenized compute capacity (\"GPU-hours\"): an SPL mint whose supply is",
        "fully collateralised by buyer payments held in escrow. Credits are spent",
        "in attested sessions; the provider converts credits it earned back into",
        "the payment token, and holders can refund if the provider defaults."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "creditMint",
            "type": "pubkey"
          },
          {
            "name": "paymentMint",
            "type": "pubkey"
          },
          {
            "name": "pricePerCredit",
            "docs": [
              "Payment-token base units per credit (credits have 0 decimals)."
            ],
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "minted",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "unit",
            "docs": [
              "Human-readable unit, e.g. \"h100-gpu-second\" or \"1k-tokens:llama-3.1-70b\"."
            ],
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "offeringCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offering",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "creditMint",
            "type": "pubkey"
          },
          {
            "name": "paymentMint",
            "type": "pubkey"
          },
          {
            "name": "pricePerCredit",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "openSessionArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "salt",
            "docs": [
              "Disambiguates concurrent sessions between the same payer and provider."
            ],
            "type": "u64"
          },
          {
            "name": "deposit",
            "type": "u64"
          },
          {
            "name": "pricePerUnit",
            "docs": [
              "Price in token base units per metered unit (agreed off-chain via the 402 challenge)."
            ],
            "type": "u64"
          },
          {
            "name": "gracePeriod",
            "type": "u32"
          },
          {
            "name": "authorizedSigner",
            "docs": [
              "Key that signs vouchers (an agent's hot / ephemeral key)."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "paidFeedback",
      "docs": [
        "Payment-backed feedback. Each rating is bound to a session that actually",
        "settled value through an attested enclave, so indexers can forward it to",
        "the 8004 reputation registry with an unforgeable proof-of-payment link."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "agentAsset",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "settled",
            "type": "u64"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "rating",
            "type": "u8"
          },
          {
            "name": "transcriptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "provider",
      "docs": [
        "A compute provider (GPU operator) offering attested inference."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "docs": [
              "Wallet receiving settlements."
            ],
            "type": "pubkey"
          },
          {
            "name": "agentAsset",
            "docs": [
              "Optional 8004 / Metaplex Core agent asset representing this provider's identity."
            ],
            "type": "pubkey"
          },
          {
            "name": "endpoint",
            "type": "string"
          },
          {
            "name": "activeAttestation",
            "docs": [
              "Most recently validated attestation (default pubkey when none)."
            ],
            "type": "pubkey"
          },
          {
            "name": "offeringCount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "stats",
            "type": {
              "defined": {
                "name": "providerStats"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "providerRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "pubkey"
          },
          {
            "name": "agentAsset",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "providerStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sessionsOpened",
            "type": "u64"
          },
          {
            "name": "sessionsClosed",
            "type": "u64"
          },
          {
            "name": "forcedCloses",
            "docs": [
              "Sessions closed without provider cooperation (grace expiry or invalid attestation)."
            ],
            "type": "u64"
          },
          {
            "name": "settlements",
            "type": "u64"
          },
          {
            "name": "unitsServed",
            "type": "u64"
          },
          {
            "name": "ratingsCount",
            "docs": [
              "Ratings are only accepted from payers whose sessions actually settled payment."
            ],
            "type": "u64"
          },
          {
            "name": "ratingsSum",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "providerUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "pubkey"
          },
          {
            "name": "agentAsset",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "registerProviderArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payout",
            "type": "pubkey"
          },
          {
            "name": "agentAsset",
            "type": "pubkey"
          },
          {
            "name": "endpoint",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "session",
      "docs": [
        "An attestation-gated metered payment session (a unidirectional payment",
        "channel whose settlement additionally requires an enclave-signed receipt)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "docs": [
              "Refund owner: the payer wallet, or the `AgentVault` PDA for vault-funded sessions."
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "`AgentVault` PDA when vault-funded, default otherwise."
            ],
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Account that paid rent; receives it back on finalize."
            ],
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "enclaveKey",
            "docs": [
              "Snapshot of `attestation.enclave_key` (receipt signer)."
            ],
            "type": "pubkey"
          },
          {
            "name": "authorizedSigner",
            "docs": [
              "Voucher signer (usually an agent's ephemeral session key)."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "salt",
            "type": "u64"
          },
          {
            "name": "pricePerUnit",
            "type": "u64"
          },
          {
            "name": "deposit",
            "type": "u64"
          },
          {
            "name": "settled",
            "docs": [
              "Cumulative amount paid out (gross, including protocol fee)."
            ],
            "type": "u64"
          },
          {
            "name": "unitsSettled",
            "type": "u64"
          },
          {
            "name": "transcriptHash",
            "docs": [
              "Last enclave transcript hash committed on-chain (audit trail)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "closeRequestedAt",
            "type": "i64"
          },
          {
            "name": "gracePeriod",
            "type": "u32"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "sessionCloseRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "requestedBy",
            "type": "pubkey"
          },
          {
            "name": "closesAfter",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "sessionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "settled",
            "type": "u64"
          },
          {
            "name": "refunded",
            "type": "u64"
          },
          {
            "name": "forced",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "sessionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "authorizedSigner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "deposit",
            "type": "u64"
          },
          {
            "name": "pricePerUnit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "sessionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "settled",
            "type": "u64"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "transcriptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sessionToppedUp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "deposit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "submitAttestationArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enclaveKey",
            "type": "pubkey"
          },
          {
            "name": "encryptionKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "teeType",
            "type": "u8"
          },
          {
            "name": "measurement",
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "evidenceUri",
            "type": "string"
          },
          {
            "name": "requestedTtl",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "updateConfigArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newAdmin",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "treasury",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "verifiers",
            "type": {
              "option": {
                "vec": "pubkey"
              }
            }
          },
          {
            "name": "verifierThreshold",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "protocolFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "maxAttestationTtl",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "allowSimulatedTee",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "paused",
            "type": {
              "option": "bool"
            }
          }
        ]
      }
    },
    {
      "name": "updateProviderArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payout",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "agentAsset",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "endpoint",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "updateVaultArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": {
              "option": {
                "defined": {
                  "name": "vaultPolicy"
                }
              }
            }
          },
          {
            "name": "frozen",
            "type": {
              "option": "bool"
            }
          }
        ]
      }
    },
    {
      "name": "vaultCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "vaultPolicy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maxPerSession",
            "type": "u64"
          },
          {
            "name": "periodLimit",
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u32"
          },
          {
            "name": "minProviderRating",
            "type": "u8"
          },
          {
            "name": "allowedTeeMask",
            "type": "u16"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "vaultUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "frozen",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "vaultWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
