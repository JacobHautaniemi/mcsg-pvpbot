const mineflayer = require('mineflayer');
const pvp = require('mineflayer-pvp').plugin;
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');

// Function to generate a random username
function generateRandomUsername(baseName) {
    const randomSuffix = Math.floor(Math.random() * 10);
    return `${baseName}_${randomSuffix}`;
}
// Variable to hold the bot's username
let BotUsername;

function createBot() {
    const bot = mineflayer.createBot({
        host: process.argv[2],
        port: process.argv[3],
        username: generateRandomUsername('pvp_Bot'),
        password: process.argv[5],
        logErrors: false
    });

    bot.setMaxListeners(20);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(pathfinder);

        // Rest of your bot logic...
    let huntInitiationTimeout;
    let huntCountdownActive = false;
    let beingAttacked = false;

    bot.on('playerCollect', (collector, itemDrop) => {
        if (collector !== bot.entity) return;

        setTimeout(() => {
            //const sword = bot.inventory.items().find(item => item.name.includes('sword'));
            //if (sword) bot.equip(sword, 'hand');
        }, 150);
    });

    bot.on('playerCollect', (collector, itemDrop) => {
        if (collector !== bot.entity) return;

        setTimeout(() => {
            const shield = bot.inventory.items().find(item => item.name.includes('shield'));
            if (shield) bot.equip(shield, 'off-hand');
        }, 250);
    });

    let guardPos = null;

    function guardArea(pos) {
        guardPos = pos.clone();

        if (!bot.pvp.target) {
            moveToGuardPos();
        }
    }

    function stopGuarding() {
        guardPos = null;
        bot.pvp.stop();
        bot.pathfinder.setGoal(null);
    }

    function moveToGuardPos() {
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
        bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z));
    }

        

    function roamRandomly() {
        const mcData = require('minecraft-data')(bot.version);
        const movements = new Movements(bot, mcData);

        // Define the range within which the bot can roam
        const range = 32;
        const randomX = bot.entity.position.x + Math.floor(Math.random() * range * 2) - range;
        const randomZ = bot.entity.position.z + Math.floor(Math.random() * range * 2) - range;

        // Create a random goal within the defined range
        const goal = new goals.GoalXZ(randomX, randomZ);

        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(goal);
    }

    async function sayMessagesWithDelay(messages, delay) {
        for (const message of messages) {
          bot.chat(message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

    bot.on('stoppedAttacking', () => {
        if (guardPos) {
            moveToGuardPos();
        }
    });

    bot.on('physicsTick', () => {
        if (bot.pvp.target) return;
        if (bot.pathfinder.isMoving()) return;

        roamRandomly();
    });

    bot.on('physicsTick', () => {
        if (!guardPos) return;

        const filter = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 &&
            e.mobType !== 'Armor Stand'; // Mojang classifies armor stands as mobs for some reason?

        const entity = bot.nearestEntity(filter);
        if (entity) {
            bot.pvp.attack(entity);
        }
    });

    bot.on('login', () => {
        BotUsername = bot.username;
    });

    function executeActionsWithDelay(actions, delay) {
      let index = 0;

     function executeNext() {
        if (index >= actions.length) return;

        const action = actions[index];

        if (action.type === 'command') {
            bot.chat(action.message);
        } else if (action.type === 'armor') {
            action.action();
        }

        index++;
        setTimeout(executeNext, delay);
        }

        executeNext();
    }

    let gamesHaveBegun = false; // Flag to indicate if the games have begun
    let huntInitiated = false; // Flag to indicate if the hunt has been initiated

    bot.on('chat', (username, message) => {
        if (message.startsWith('The games have begun!')) {
            const actions = [
                { type: 'command', message: `/give ${BotUsername} chainmail_leggings` },
                { type: 'armor', action: () => bot.armorManager.equipAll() },
                { type: 'command', message: `/give ${BotUsername} chainmail_chestplate` },
                { type: 'armor', action: () => bot.armorManager.equipAll() },
                { type: 'command', message: `/give ${BotUsername} wooden_sword` },
                { type: 'armor', action: () => bot.armorManager.equipAll() },
                { type: 'command', message: `/give ${BotUsername} cooked_chicken 25` },
                { type: 'armor', action: () => bot.armorManager.equipAll() }
            ];

            // Ensure the commands execute only after the bot has logged in
            setTimeout(() => {
                executeActionsWithDelay(actions, 1000);
            }, 1000);
            
            bot.chat('Initiating hunt in 30 seconds.');
            gamesHaveBegun = true; // Set the flag to true
            huntInitiated = false; // Reset the flag
            huntCountdownActive = true; // Start the countdown
            huntInitiationTimeout = setTimeout(() => {
                huntInitiated = true; // Set the flag to true after 30 seconds
            }, 30000); // 30 seconds delay
        }

        if (message.startsWith('The games have ended!')) {
            bot.chat('Stopping PvP combat.');
            bot.pvp.stop();
            bot.chat('Returning to random roaming.');
            roamRandomly();
            gamesHaveBegun = false; // Reset the flag
            huntInitiated = false;
            huntCountdownActive = false;
            clearTimeout(huntInitiationTimeout);
        }

        if (message.startsWith('say ')) {
            const sayMessage = message.substring(4);
            bot.chat(sayMessage.repeat(1)); // Repeat the message 3 times
        }

        if (message.startsWith('command ')) {
            const command = message.substring(8);
            bot.chat(`/${command}`);
        }
    });

    // Function to periodically check for players in the 200 block radius
    function checkForPlayers() {
        if (!gamesHaveBegun || !huntInitiated) return; // Don't initiate attack if games haven't begun or if hunt hasn't been initiated

        const entity = bot.nearestEntity((entity) => { return entity.type === 'player' && entity.position.distanceTo(bot.entity.position) <= 200;
        });

        if (entity) {
            bot.chat('Enemy detected! Initiating hunt.');
            bot.pvp.attack(entity);
        }
    }


    // Function to check if the bot is being attacked
    bot.on('health', () => {
        const player = bot.players[Object.keys(bot.players)[0]];
        if (!player) return; // If there are no players nearby, return

        const damageTaken = 20 - bot.health; // Calculate the damage taken
        if (damageTaken > 0 && huntCountdownActive && !huntInitiated) {
            beingAttacked = true; // Set beingAttacked flag to true
            clearTimeout(huntInitiationTimeout); // Stop the countdown if being attacked
            bot.chat('Being attacked! Initiating hunt immediately.');

            huntInitiated = true;
            checkForPlayers(); // Start hunting immediately
        } else {
            beingAttacked = false; // Reset beingAttacked flag
        }
    });

    // Function to eat food when hunger is below 75%
    async function eatIfHungry() {
     if (bot.food < 15) { // Hunger bar is 20, so 15 is 75%
        const food = bot.inventory.items().find(item => item.name === 'cooked_chicken');
        const sword = bot.inventory.items().find(item => item.name.includes('sword'));

        if (food) {
            try {                
                await bot.equip(food, 'hand'); // Equip food to eat
                await bot.consume(); // Consume the food
                if (sword) {
                    await bot.equip(sword, 'hand'); // Re-equip sword after eating
                }
            } catch (err) {
            }
        } else {
        }
     } else {
     }
    }



    // Periodically check hunger level
    setInterval(eatIfHungry, 10000);

    // Call the checkForPlayers function every 5 seconds
    setInterval(checkForPlayers, 5000);
}

// Start the bot
createBot();
