import * as $j from 'jquery';
import { Ability } from './ability';
import { search } from './utility/pathfinding';
import { Hex } from './utility/hex';
import Game from './game';
import * as arrayUtils from './utility/arrayUtils';
import { Drop, DropDefinition } from './drop';
import { Point, getPointFacade } from './utility/pointfacade';
import { Effect } from './effect';
import { Player, PlayerID } from './player';
import { Damage } from './damage';
import { AugmentedMatrix } from './utility/matrices';
import { HEX_WIDTH_PX } from './utility/const';

// to fix @ts-expect-error 2554: properly type the arguments for the trigger functions in `game.ts`

export type CreatureVitals = {
	health: number;
	regrowth: number;
	endurance: number;
	energy: number;
	meditation: number;
	initiative: number;
	offense: number;
	defense: number;
	movement: number;
};

export type CreatureMasteries = {
	pierce: number;
	slash: number;
	crush: number;
	shock: number;
	burn: number;
	frost: number;
	poison: number;
	sonic: number;
	mental: number;
};

type CreatureStats = CreatureVitals &
	CreatureMasteries & {
		moveable: boolean;
		fatigueImmunity: boolean;
		reqEnergy: number;
	};

type TracePositionOptions = Partial<{
	x: number;
	y: number;
	overlayClass: string;
	displayClass: string;
	drawOverCreatureTiles: boolean;
}>;

type QueryMoveOptions = Partial<{
	targeting: boolean;
	noPath: boolean;
	isAbility: boolean;
	ownCreatureHexShade: boolean;
	range: Hex[];
	callback: (hex: Hex, args: any) => void;
	args: any;
}>;

type Status = {
	frozen: boolean;
	cryostasis: boolean;
	dizzy: boolean;
};

type Movement = 'normal' | 'flying';

/**
 * Creature Class
 *
 * Creature contains all creatures properties and attacks
 */
export class Creature {
	//TODO: This can be removed when it is factored out of get fatigueText
	#fatigueText = '';

	/* Attributes
	 *
	 * NOTE : attributes and variables starting with $ are jquery element
	 * and jquery function can be called directly from them.
	 *
	 * // Jquery attributes
	 * $display :		Creature representation
	 * $effects :		Effects container (inside $display)
	 *
	 * // Normal attributes
	 * x :				Integer :	Hex coordinates
	 * y :				Integer :	Hex coordinates
	 * pos :			Object :	Pos object for hex comparison {x,y}
	 *
	 * name :			String :	Creature name
	 * id :			Integer :	Creature Id incrementing for each creature starting to 1
	 * size :			Integer :	Creature size in hexes (1,2 or 3)
	 * type :			Integer :	Type of the creature stocked in the database
	 * team :			Integer :	Owner's ID (0,1,2 or 3)
	 * player :		Player :	Player object shortcut
	 * hexagons :		Array :		Array containing the hexes where the creature is
	 *
	 * dead :			Boolean :	True if dead
	 * stats :			Object :	Object containing stats of the creature
	 * statsAlt :		Object :	Object containing the alteration value for each stat //todo
	 * abilities :		Array :		Array containing the 4 abilities
	 * remainingMove : Integer :	Remaining moves allowed until the end of turn
	 * temp :           Boolean :   True if the creature is only temporary for preview, false otherwise
	 *
	 */

	/* Constructor(obj)
	 *
	 * obj :			Object :	Object containing all creature stats
	 *
	 */
	// Engine
	game: Game;
	name: string;
	id: number;
	x: number;
	y: number;
	pos: { x: number; y: number };
	size: number;
	type: string;
	level: number;
	realm: string;
	animation: { walk_speed: number };
	display: object;
	drop: DropDefinition;
	_movementType: Movement;
	temp: boolean;
	hexagons: Hex[];
	team: PlayerID;
	player: Player;

	// Game
	dead: boolean;
	undead: boolean;
	killer: Player;
	hasWait: boolean;
	travelDist: number;
	effects: Array<any>;
	dropCollection: Drop[];
	protectedFromFatigue: boolean;
	turnsActive: number;
	private _nextGameTurnActive: number;
	private _waitedTurn: number;
	private _hinderedTurn: number;
	materializationSickness: boolean;
	noActionPossible: boolean;
	destroy: any;

	// Statistics
	baseStats: CreatureStats;
	stats: CreatureStats;
	status: Status;
	health: number;
	oldHealth: number;
	endurance: number;
	energy: number;
	oldEnergy: number;
	remainingMove: number;
	abilities: Ability[];

	// Phaser

	grp: Phaser.Group;
	sprite: Phaser.Sprite;
	hintGrp: Phaser.Group;
	healthIndicatorGroup: Phaser.Group;
	healthIndicatorSprite: Phaser.Sprite;
	healthIndicatorText: Phaser.Text;
	healthIndicatorTween: Phaser.Tween | null;

	constructor(obj, game: Game) {
		// Engine
		this.game = game;
		this.name = obj.name;
		this.id = game.creatures.length;
		this.x = obj.x - 0;
		this.y = obj.y - 0;
		this.pos = {
			x: this.x,
			y: this.y,
		};
		this.size = obj.size - 0;
		this.type = obj.type;
		this.level = obj.level - 0;
		this.realm = obj.realm;
		this.animation = obj.animation;
		this.display = obj.display;
		this.drop = obj.drop;
		this._movementType = 'normal';
		this.temp = obj.temp;

		if (obj.movementType) {
			this._movementType = obj.movementType;
		}

		this.hexagons = [];

		// Game
		this.team = obj.team; // = playerID (0,1,2,3)
		this.player = game.players[obj.team];
		this.dead = false;
		this.killer = undefined;
		this.hasWait = false;
		this.travelDist = 0;
		this.effects = [];
		this.dropCollection = [];
		this.protectedFromFatigue = this.isDarkPriest() ? true : false;
		this.turnsActive = 0;

		// Statistics
		this.baseStats = {
			health: obj.stats.health - 0,
			endurance: obj.stats.endurance - 0,
			regrowth: obj.stats.regrowth - 0,
			energy: obj.stats.energy - 0,
			meditation: obj.stats.meditation - 0,
			initiative: obj.stats.initiative - 0,
			offense: obj.stats.offense - 0,
			defense: obj.stats.defense - 0,
			movement: obj.stats.movement - 0,
			pierce: obj.stats.pierce - 0,
			slash: obj.stats.slash - 0,
			crush: obj.stats.crush - 0,
			shock: obj.stats.shock - 0,
			burn: obj.stats.burn - 0,
			frost: obj.stats.frost - 0,
			poison: obj.stats.poison - 0,
			sonic: obj.stats.sonic - 0,
			mental: obj.stats.mental - 0,

			/* TODO: Move boolean flags into this.status, because updateAlterations() resets
			this.stats unless they've been applied via an effect. */
			moveable: true,
			fatigueImmunity: false,
			// Extra energy required for abilities
			reqEnergy: 0,
		};

		this.stats = {
			...this.baseStats,

			/**
			 * Represents the available "pool" or maximum health of the creature.
			 * `this.health` represents the current remaining health which cannot exceed
			 * this value.
			 */
			health: this.baseStats.health,

			/**
			 * Represents the available "pool" or maximum energy of the creature.
			 * `this.energy` represents the current remaining energy which cannot exceed
			 * this value.
			 */
			energy: this.baseStats.energy,

			/**
			 * Represents the available "pool" or maximum endurance of the creature.
			 * `this.endurance` represents the current remaining endurance which cannot
			 * exceed this value. It also cannot be lower than 0.
			 */
			endurance: this.baseStats.endurance,

			/**
			 * Represents the available "pool" or maximum movement of the creature.
			 * `this.remainingMove` represents the current remaining movement which cannot
			 * exceed this value.
			 */
			movement: this.baseStats.movement,
		};

		this.status = {
			/**
			 * "Frozen" creature will miss their next turn. Frozen expires at the end
			 * of their next (missed) turn. Any damage will break the frozen status.
			 */
			frozen: false,

			/**
			 * "Cryostasis" enhances the "Frozen" status to not break on damage from any
			 * source.
			 */
			cryostasis: false,

			/**
			 * Another type of "Frozen", with a different name.
			 */
			dizzy: false,
		};

		// Current health. Maximum health is `this.stats.health`.
		this.health = obj.stats.health;
		// Current endurance. Maximum endurance is `this.stats.endurance`.
		this.endurance = obj.stats.endurance;
		// Current energy. Maximum energy is `this.stats.energy`.
		this.energy = obj.stats.energy;
		// Current movement. Maximum movement is `this.stats.movement`.
		this.remainingMove = 0; //Default value recovered each turn

		// Abilities
		this.abilities = [
			new Ability(this, 0, game),
			new Ability(this, 1, game),
			new Ability(this, 2, game),
			new Ability(this, 3, game),
		];

		this.updateHex();

		let dp = '';

		if (this.type === '--') {
			switch (this.team) {
				case 0:
					dp = 'red';
					break;
				case 1:
					dp = 'blue';
					break;
				case 2:
					dp = 'orange';
					break;
				case 3:
					dp = 'green';
					break;
			}
		}

		// Creature Container
		this.grp = game.Phaser.add.group(game.grid.creatureGroup, 'creatureGrp_' + this.id);
		this.grp.alpha = 0;
		// Adding sprite
		this.sprite = this.grp.create(0, 0, this.name + dp + '_cardboard');
		this.sprite.anchor.setTo(0.5, 1);
		// Placing sprite
		this.sprite.x =
			(!this.player.flipped
				? this.display['offset-x']
				: HEX_WIDTH_PX * this.size - this.sprite.texture.width - this.display['offset-x']) +
			this.sprite.texture.width / 2;
		this.sprite.y = this.display['offset-y'] + this.sprite.texture.height;
		// Placing Group
		this.grp.x = this.hexagons[this.size - 1].displayPos.x;
		this.grp.y = this.hexagons[this.size - 1].displayPos.y;

		this.facePlayerDefault();

		// Hint Group
		this.hintGrp = game.Phaser.add.group(this.grp, 'creatureHintGrp_' + this.id);
		this.hintGrp.x = 0.5 * HEX_WIDTH_PX * this.size;
		this.hintGrp.y = -this.sprite.texture.height + 5;

		// Health indicator
		this.healthIndicatorGroup = game.Phaser.add.group(this.grp, 'creatureHealthGrp_' + this.id);
		// Adding background sprite
		this.healthIndicatorSprite = this.healthIndicatorGroup.create(
			this.player.flipped ? 19 : 19 + HEX_WIDTH_PX * (this.size - 1),
			49,
			'p' + this.team + '_health',
		);
		// Add text
		this.healthIndicatorText = game.Phaser.add.text(
			this.player.flipped ? HEX_WIDTH_PX * 0.5 : HEX_WIDTH_PX * (this.size - 0.5),
			63,
			this.health,
			{
				font: 'bold 15pt Play',
				fill: '#fff',
				align: 'center',
				stroke: '#000',
				strokeThickness: 6,
			},
		);
		this.healthIndicatorText.anchor.setTo(0.5, 0.5);
		this.healthIndicatorGroup.add(this.healthIndicatorText);
		// Hide it
		this.healthIndicatorGroup.alpha = 0;

		if (!this.temp) {
			for (const other of game.creatures.filter((c) => c)) {
				if (other.type === this.type && other.team === this.team && other.temp) {
					/**
					 *  NOTE:
					 * `this` is the summoned version of `other`
					 *
					 * `this` is a summoned Creature: temp == false.
					 * `other` is an "unmaterialized" Creature: temp == true.
					 *
					 * Use the "unmaterialized" creature's id so that `this` will replace
					 * `other` in `game.creatures`.
					 */
					this.id = other.id;
				}
			}
		}
		// Adding Himself to creature arrays and queue
		game.creatures[this.id] = this;
		if (typeof obj.materializationSickness !== 'undefined') {
			this.materializationSickness = obj.materializationSickness;
		} else {
			this.materializationSickness = this.isDarkPriest() ? false : true;
		}
		this.noActionPossible = false;

		this._nextGameTurnActive =
			!this.materializationSickness || this.isDarkPriest() ? this.game.turn : this.game.turn + 1;
		this._waitedTurn = -1;
		this._hinderedTurn = -1;
	}

	/**
	 * Summon animation.
	 */
	summon(disableMaterializationSickness = false) {
		const game = this.game;

		/* Without Sickness the creature should act in the current turn, except the dark
		priest who must always be in the next queue to properly start the game. */
		const alsoAddToCurrentQueue = disableMaterializationSickness && !this.isDarkPriest();

		if (disableMaterializationSickness) {
			this.materializationSickness = false;
		}

		game.queue.update();
		game.updateQueueDisplay();

		game.grid.orderCreatureZ();

		if (game.grid.materialize_overlay) {
			game.grid.materialize_overlay.alpha = 0.5;
			game.Phaser.add
				.tween(game.grid.materialize_overlay)
				.to(
					{
						alpha: 0,
					},
					500,
					Phaser.Easing.Linear.None,
				)
				.start();
		}

		game.Phaser.add
			.tween(this.grp)
			.to(
				{
					alpha: 1,
				},
				500,
				Phaser.Easing.Linear.None,
			)
			.start();

		// Reveal and position health indicator
		this.updateHealth();
		this.healthShow();

		// Trigger trap under
		this.hexagons.forEach((hex) => {
			hex.activateTrap(game.triggers.onStepIn, this);
		});

		// Pickup drop
		this.pickupDrop();
		this.hint(this.name, 'creature_name');
	}

	healthHide() {
		this.healthIndicatorGroup.alpha = 0;
	}

	healthShow() {
		this.healthIndicatorGroup.alpha = 1;
	}

	/* activate()
	 *
	 * Activate the creature by showing movement range and binding controls to this creature
	 *
	 */
	activate() {
		this.travelDist = 0;
		this.oldEnergy = this.energy;
		this.oldHealth = this.health;
		this.noActionPossible = false;

		const game = this.game;
		const stats = this.stats;
		const varReset = () => {
			this.game.onReset(this);
			// Variables reset
			this.updateAlteration();
			this.remainingMove = stats.movement;

			if (!this.materializationSickness) {
				// Fatigued creatures (endurance 0) should not regenerate.
				if (!this.isFatigued()) {
					this.heal(stats.regrowth, true);

					if (stats.meditation > 0) {
						this.recharge(stats.meditation);
					}
				} else {
					stats.regrowth < 0 ? this.heal(stats.regrowth, true) : this.hint('♦', 'damage');
				}
			} else {
				this.hint('♣', 'damage');
			}

			setTimeout(() => {
				game.UI.energyBar.animSize(this.energy / stats.energy);
				game.UI.healthBar.animSize(this.health / stats.health);
			}, 1000);

			this.endurance = stats.endurance;

			this.abilities.forEach((ability) => {
				ability.reset();
			});
		};
		varReset.bind(this);

		// Frozen or dizzy effect
		if (this.isFrozen() || this.isDizzy()) {
			varReset();
			const interval = setInterval(() => {
				if (!game.turnThrottle) {
					clearInterval(interval);
					game.skipTurn({
						tooltip: this.isFrozen() ? 'Frozen' : 'Dizzy',
					});
				}
			}, 50);
			return;
		}

		if (!this.hasWait) {
			varReset();

			// Trigger
			// @ts-expect-error 2554
			game.onStartPhase(this);
		}

		this.materializationSickness = false;

		const interval = setInterval(() => {
			// if (!game.freezedInput) { remove for muliplayer
			clearInterval(interval);
			if (game.turn >= game.minimumTurnBeforeFleeing) {
				game.UI.btnFlee.changeState('normal');
			}

			game.startTimer();
			this.queryMove(null);
			// }
		}, 1000);
	}

	/**
	 * Deactivate the creature. Called when the creature is active, then is no longer active.
	 *
	 * @param {'wait' | 'turn-end'} reason: Why is the creature deactivated?
	 */
	deactivate(reason: 'wait' | 'turn-end') {
		const game = this.game;
		this.hasWait = this.isDelayed;
		this.status.frozen = false;
		this.status.cryostasis = false;
		this.status.dizzy = false;

		// Effects triggers
		if (reason === 'turn-end') {
			this.turnsActive += 1;
			this._nextGameTurnActive = game.turn + 1;
			// @ts-expect-error 2554
			game.onEndPhase(this);
		}
	}

	get isInCurrentQueue() {
		return !this.dead && !this.temp && this._nextGameTurnActive <= this.game.turn;
	}

	get isInNextQueue() {
		return !this.dead;
	}

	get isDelayedInNextQueue(): null | boolean {
		if (!this.isInNextQueue) return null;
		return !this.isInCurrentQueue && this.isDelayed;
	}

	/**
	 * @deprecated Use isDelayed
	 */
	get delayed() {
		return this.isDelayed;
	}

	get isDelayed() {
		return this.isWaiting || this.isHindered;
	}

	get isWaiting() {
		return this._waitedTurn >= this.turnsActive;
	}

	get isHindered() {
		return this._hinderedTurn >= this.turnsActive;
	}

	/**
	 * @deprecated Use canWait
	 */
	get delayable() {
		return this.canWait;
	}

	/**
	 * Is waiting possible?
	 */
	get canWait() {
		const hasUnusedAbilities = this.abilities.some((a) => !a.used);
		return !this.isDelayed && this.remainingMove > 0 && hasUnusedAbilities;
	}

	/**
	 * The creature waits. It will have its turn at the end of the round.
	 * The player has decided to delay the creature until the end of the turn.
	 */
	wait(): void {
		if (this.canWait) {
			const game = this.game;

			this._waitedTurn = this.turnsActive;
			this.hint('Delayed', 'msg_effects');
			game.updateQueueDisplay();
			this.deactivate('wait');
		}
	}

	/**
	 * A creature's turn is delayed as part of an attack from another creature.
	 */
	hinder(): void {
		const game = this.game;

		this._hinderedTurn = this.turnsActive;
		this.hint('Delayed', 'msg_effects');
		game.updateQueueDisplay();
	}

	/* queryMove()
	 * launch move action query
	 */
	// TODO: type `args` in `QueryMoveOptions`
	queryMove(options?: QueryMoveOptions) {
		const game = this.game;

		if (this.dead) {
			// Creatures can die during their turns from trap effects; make sure this
			// function doesn't do anything
			return;
		}

		// Once Per Damage Abilities recover
		game.creatures.forEach((creature) => {
			//For all Creature
			if (creature) {
				creature.abilities.forEach((ability) => {
					if (game.triggers.oncePerDamageChain.test(ability.getTrigger())) {
						ability.setUsed(false);
					}
				});
			}
		});

		// Clean up temporary creature if a summon was cancelled.
		if (game.creatures[game.creatures.length - 1].temp) {
			game.creatures.pop();
		}

		let remainingMove = this.remainingMove;
		// No movement range if unmoveable
		if (!this.stats.moveable) {
			remainingMove = 0;
		}

		const defaultOptions = {
				targeting: false,
				noPath: false,
				isAbility: false,
				ownCreatureHexShade: true,
				range: game.grid.getMovementRange(this.x, this.y, remainingMove, this.size, this.id),
				callback: function (hex: Hex, args) {
					if (hex.x == args.creature.x && hex.y == args.creature.y) {
						// Prevent null movement
						game.activeCreature.queryMove();
						return;
					}

					game.gamelog.add({
						action: 'move',
						target: {
							x: hex.x,
							y: hex.y,
						},
					});
					if (game.multiplayer) {
						game.gameplay.moveTo({
							target: {
								x: hex.x,
								y: hex.y,
							},
						});
					}
					game.UI.btnDelay.changeState('disabled');
					args.creature.moveTo(hex, {
						animation: args.creature.movementType() === 'flying' ? 'fly' : 'walk',
						callback: function () {
							game.activeCreature.queryMove();
						},
					});
				},
			},
			// overwrite any fields of `defaultOptions` that were provided in `options`
			o = $j.extend(defaultOptions, options);

		if (!o.isAbility) {
			if (game.UI.selectedAbility != -1) {
				this.hint('Canceled', 'gamehintblack');
			}

			$j('#abilities .ability').removeClass('active');
			game.UI.selectAbility(-1);
			game.UI.updateQueueDisplay();
		}

		game.grid.orderCreatureZ();
		this.facePlayerDefault();
		this.updateHealth();

		if (this.movementType() === 'flying') {
			o.range = game.grid.getFlyingRange(this.x, this.y, remainingMove, this.size, this.id);
		}

		const selectNormal = function (hex, args) {
			args.creature.tracePath(hex);
		};

		const selectFlying = function (hex, args) {
			args.creature.tracePosition({
				x: hex.x,
				y: hex.y,
				overlayClass: 'creature moveto selected player' + args.creature.team,
			});
		};
		const select = o.noPath || this.movementType() === 'flying' ? selectFlying : selectNormal;

		if (this.noActionPossible) {
			game.grid.querySelf({
				fnOnConfirm: function () {
					game.UI.btnSkipTurn.click();
				},
				fnOnCancel: function () {},
				confirmText: 'Skip turn',
			});
		} else {
			game.grid.queryHexes({
				fnOnSelect: select,
				fnOnConfirm: o.callback,
				args: {
					creature: this,
					args: o.args,
				}, // Optional args
				size: this.size,
				flipped: this.player.flipped,
				id: this.id,
				hexes: o.range,
				ownCreatureHexShade: o.ownCreatureHexShade,
				targeting: o.targeting,
			});
		}
	}

	/* previewPosition(hex)
	 *
	 * hex :		Hex :		Position
	 *
	 * Preview the creature position at the given Hex
	 *
	 */
	previewPosition(hex: Hex) {
		const game = this.game;

		game.grid.cleanOverlay('hover h_player' + this.team);
		if (!game.grid.hexes[hex.y][hex.x].isWalkable(this.size, this.id)) {
			return; // Break if not walkable
		}

		this.tracePosition({
			x: hex.x,
			y: hex.y,
			overlayClass: 'hover h_player' + this.team,
		});
	}

	startBounce() {
		const bounceHeight = 10;
		const duration = 350;

		if (!this.healthIndicatorTween || !this.healthIndicatorTween.isRunning) {
			const originalY = this.healthIndicatorGroup.y;
			const targetY = originalY - bounceHeight;

			this.healthIndicatorTween = this.game.Phaser.add
				.tween(this.healthIndicatorGroup)
				.to({ y: targetY }, duration, Phaser.Easing.Quadratic.InOut, true)
				.yoyo(true)
				.repeat(-1);
		} else {
			this.healthIndicatorTween.stop();
			this.healthIndicatorTween = null;
			this.game.Phaser.add
				.tween(this.healthIndicatorGroup)
				.to({ y: 0 }, duration, Phaser.Easing.Quadratic.InOut, true);
		}
	}

	resetBounce() {
		if (this.healthIndicatorTween && this.healthIndicatorTween.isRunning) {
			this.healthIndicatorTween.stop();
			this.healthIndicatorGroup.y = 0;
		}
	}

	/* cleanHex()
	 *
	 * Clean current creature hexagons
	 *
	 */
	cleanHex() {
		this.hexagons.forEach((hex) => {
			hex.creature = undefined;
		});
		this.hexagons = [];
	}

	/* updateHex()
	 *
	 * Update the current hexes containing the creature and their display
	 *
	 */
	updateHex() {
		const count = this.size;
		let i;

		for (i = 0; i < count; i++) {
			this.hexagons.push(this.game.grid.hexes[this.y][this.x - i]);
		}

		this.hexagons.forEach((hex) => {
			hex.creature = this;
		});
	}

	/* faceHex(facefrom,faceto)
	 *
	 * facefrom :	Hex or Creature :	Hex to face from
	 * faceto :	Hex or Creature :	Hex to face
	 *
	 * Face creature at given hex
	 *
	 */
	faceHex(
		faceto: Hex | Creature,
		facefrom?: Hex | Creature,
		ignoreCreaHex?: boolean,
		attackFix?: boolean,
	) {
		if (!facefrom) {
			facefrom = this.player.flipped ? this.hexagons[this.size - 1] : this.hexagons[0];
		}

		if (
			ignoreCreaHex &&
			faceto instanceof Hex &&
			facefrom instanceof Hex &&
			this.hexagons.indexOf(faceto) != -1 &&
			this.hexagons.indexOf(facefrom) != -1
		) {
			this.facePlayerDefault();
			return;
		}

		if (faceto instanceof Creature) {
			if (faceto === this) {
				this.facePlayerDefault();
				return;
			}
			faceto = faceto.size < 2 ? faceto.hexagons[0] : faceto.hexagons[1];
		}

		if (faceto.x == facefrom.x && faceto.y == facefrom.y) {
			this.facePlayerDefault();
			return;
		}

		if (attackFix && this.size > 1) {
			//only works on 2hex creature targeting the adjacent row
			const flipOffset = this.player.flipped ? 1 : 0;
			if (facefrom.y % 2 === 0) {
				if (faceto.x - flipOffset == facefrom.x) {
					this.facePlayerDefault();
					return;
				}
			} else {
				if (faceto.x + 1 - flipOffset == facefrom.x) {
					this.facePlayerDefault();
					return;
				}
			}
		}

		const flipped = facefrom.y % 2 === 0 ? faceto.x <= facefrom.x : faceto.x < facefrom.x;

		if (flipped) {
			this.sprite.scale.setTo(-1, 1);
		} else {
			this.sprite.scale.setTo(1, 1);
		}
		this.sprite.x =
			(!flipped
				? this.display['offset-x']
				: HEX_WIDTH_PX * this.size - this.sprite.texture.width - this.display['offset-x']) +
			this.sprite.texture.width / 2;
	}

	/* facePlayerDefault()
	 *
	 * Face default direction
	 *
	 */
	facePlayerDefault() {
		if (this.player.flipped) {
			this.sprite.scale.setTo(-1, 1);
		} else {
			this.sprite.scale.setTo(1, 1);
		}
		this.sprite.x =
			(!this.player.flipped
				? this.display['offset-x']
				: HEX_WIDTH_PX * this.size - this.sprite.texture.width - this.display['offset-x']) +
			this.sprite.texture.width / 2;
	}

	/* moveTo(hex,opts)
	 *
	 * hex :		Hex :		Destination Hex
	 * opts :		Object :	Optional args object
	 *
	 * Move the creature along a calculated path to the given coordinates
	 *
	 */
	moveTo(hex, opts) {
		const game = this.game,
			defaultOpt = {
				callback: function () {
					return true;
				},
				callbackStepIn: function () {
					return true;
				},
				animation: this.movementType() === 'flying' ? 'fly' : 'walk',
				ignoreMovementPoint: false,
				ignorePath: false,
				customMovementPoint: 0,
				overrideSpeed: 0,
				turnAroundOnComplete: true,
			};
		let path;

		opts = $j.extend(defaultOpt, opts);

		// Teleportation ignores moveable
		if (this.stats.moveable || opts.animation === 'teleport') {
			const x = hex.x;
			const y = hex.y;

			if (opts.ignorePath || opts.animation == 'fly') {
				path = [hex];
			} else {
				path = this.calculatePath({ x, y });
			}

			if (path.length === 0) {
				return; // Break if empty path
			}

			game.grid.xray(new Hex(0, 0, null, game)); // Clean Xray

			this.travelDist = 0;

			game.animations[opts.animation](this, path, opts);
		} else {
			game.log('This creature cannot be moved');
		}

		const interval = setInterval(() => {
			// Check if creature's movement animation is completely finished.
			if (!game.freezedInput) {
				clearInterval(interval);
				opts.callback();
				game.signals.creature.dispatch('movementComplete', { creature: this, hex });
				// @ts-expect-error 2554
				game.onCreatureMove(this, hex); // Trigger
			}
		}, 100);
	}

	/**
	 * tracePath()
	 *
	 * @param{Point} destination: the end of the path.
	 *
	 * Trace the path from the current position to the given coordinates
	 *
	 */
	tracePath(destination: Point) {
		const path = this.calculatePath(destination); // Store path in grid to be able to compare it later

		if (path.length === 0) {
			return; // Break if empty path
		}

		path.forEach((item: { x: any; y: any }) => {
			this.tracePosition({
				x: item.x,
				y: item.y,
				displayClass: 'adj',
				drawOverCreatureTiles: false,
			});
		}); // Trace path

		// Highlight final position
		const last: any = arrayUtils.last(path);

		this.tracePosition({
			x: last.x,
			y: last.y,
			overlayClass: 'creature moveto selected player' + this.team,
			drawOverCreatureTiles: false,
		});
	}

	tracePosition(args: TracePositionOptions) {
		const defaultArgs = {
			x: this.x,
			y: this.y,
			overlayClass: '',
			displayClass: '',
			drawOverCreatureTiles: true,
		};

		args = $j.extend(defaultArgs, args);

		for (let i = 0; i < this.size; i++) {
			let canDraw = true;

			if (!args.drawOverCreatureTiles) {
				// then check to ensure this is not a creature tile
				for (let j = 0; j < this.hexagons.length; j++) {
					if (this.hexagons[j].x == args.x - i && this.hexagons[j].y == args.y) {
						canDraw = false;
						break;
					}
				}
			}
			if (canDraw) {
				const hex = this.game.grid.hexes[args.y][args.x - i];
				this.game.grid.cleanHex(hex);
				hex.overlayVisualState(args.overlayClass);
				hex.displayVisualState(args.displayClass);
			}
		}
	}

	/**
	 * calculatePath(destination:Point)
	 *
	 * @param{Point} destination: the end of the path.
	 *
	 * return :	Array :	Array containing the path hexes
	 *
	 */
	calculatePath(destination: Point) {
		const game = this.game;

		return search(
			game.grid.hexes[this.y][this.x],
			game.grid.hexes[destination.y][destination.x],
			this.size,
			this.id,
			this.game.grid,
		); // Calculate path
	}

	/* calcOffset(x,y)
	 *
	 * x :		Integer :	Destination coordinates
	 * y :		Integer :	Destination coordinates
	 *
	 * return :	Object :	New position taking into acount the size, orientation and obstacle {x,y}
	 *
	 * Return the first possible position for the creature at the given coordinates
	 *
	 */
	calcOffset(x: number, y: number) {
		const game = this.game,
			offset = game.players[this.team].flipped ? this.size - 1 : 0,
			mult = game.players[this.team].flipped ? 1 : -1; // For FLIPPED player

		for (let i = 0; i < this.size; i++) {
			// Try next hexagons to see if they fit
			if (x + offset - i * mult >= game.grid.hexes[y].length || x + offset - i * mult < 0) {
				continue;
			}

			if (game.grid.hexes[y][x + offset - i * mult].isWalkable(this.size, this.id)) {
				x += offset - i * mult;
				break;
			}
		}

		return {
			x: x,
			y: y,
		};
	}

	/* getInitiative()
	 *
	 * return :	Integer :	Initiative value to order the queue
	 *
	 */
	getInitiative(): number {
		// To avoid 2 identical initiative
		return this.stats.initiative * 500 - this.id;
	}

	/* adjacentHexes(dist)
	 *
	 * dist :		Integer :	Distance in hexagons
	 *
	 * return :	Array :		Array of adjacent hexagons
	 *
	 */
	adjacentHexes(dist: number, clockwise?: boolean) {
		const game = this.game;

		// TODO Review this algo to allow distance
		if (clockwise) {
			const hexes = [];
			let c: Array<any>;
			const o = this.y % 2 === 0 ? 1 : 0;

			if (this.size === 1) {
				c = [
					{
						y: this.y,
						x: this.x + 1,
					},
					{
						y: this.y - 1,
						x: this.x + o,
					},
					{
						y: this.y - 1,
						x: this.x - 1 + o,
					},
					{
						y: this.y,
						x: this.x - 1,
					},
					{
						y: this.y + 1,
						x: this.x - 1 + o,
					},
					{
						y: this.y + 1,
						x: this.x + o,
					},
				];
			}

			if (this.size === 2) {
				c = [
					{
						y: this.y,
						x: this.x + 1,
					},
					{
						y: this.y - 1,
						x: this.x + o,
					},
					{
						y: this.y - 1,
						x: this.x - 1 + o,
					},
					{
						y: this.y - 1,
						x: this.x - 2 + o,
					},
					{
						y: this.y,
						x: this.x - 2,
					},
					{
						y: this.y + 1,
						x: this.x - 2 + o,
					},
					{
						y: this.y + 1,
						x: this.x - 1 + o,
					},
					{
						y: this.y + 1,
						x: this.x + o,
					},
				];
			}

			if (this.size === 3) {
				c = [
					{
						y: this.y,
						x: this.x + 1,
					},
					{
						y: this.y - 1,
						x: this.x + o,
					},
					{
						y: this.y - 1,
						x: this.x - 1 + o,
					},
					{
						y: this.y - 1,
						x: this.x - 2 + o,
					},
					{
						y: this.y - 1,
						x: this.x - 3 + o,
					},
					{
						y: this.y,
						x: this.x - 3,
					},
					{
						y: this.y + 1,
						x: this.x - 3 + o,
					},
					{
						y: this.y + 1,
						x: this.x - 2 + o,
					},
					{
						y: this.y + 1,
						x: this.x - 1 + o,
					},
					{
						y: this.y + 1,
						x: this.x + o,
					},
				];
			}

			const total = c.length;
			for (let i = 0; i < total; i++) {
				const { x, y } = c[i];
				if (game.grid.hexExists(y, x)) {
					hexes.push(game.grid.hexes[y][x]);
				}
			}

			return hexes;
		}

		if (this.size > 1) {
			const hexes = this.hexagons[0].adjacentHex(dist);
			const lasthexes = this.hexagons[this.size - 1].adjacentHex(dist);

			hexes.forEach((hex: Hex) => {
				if (arrayUtils.findPos(this.hexagons, hex)) {
					arrayUtils.removePos(hexes, hex);
				} // Remove from array if own creature hex
			});

			lasthexes.forEach((hex) => {
				// If node doesnt already exist in final collection and if it's not own creature hex
				if (!arrayUtils.findPos(hexes, hex) && !arrayUtils.findPos(this.hexagons, hex)) {
					hexes.push(hex);
				}
			});

			return hexes;
		} else {
			return this.hexagons[0].adjacentHex(dist);
		}
	}

	/** recharge
	 * @param {number} amount: amount of energy to restore
	 * @return {void}
	 * Restore energy up to the max limit
	 */
	recharge(amount: number, log = true) {
		this.energy = Math.min(this.stats.energy, this.energy + amount);

		if (log) {
			this.game.log('%CreatureName' + this.id + '% recovers +' + amount + ' energy');
		}
	}

	/**
	 * Restore endurance to a creature. Will be capped against the creature's maximum
	 * endurance (this.stats.endurance).
	 *
	 * @param {*} amount Number of endurance points to restore.
	 */
	restoreEndurance(amount: number, log = true) {
		this.endurance = Math.min(this.stats.endurance, this.endurance + amount);

		if (log) {
			this.game.log('%CreatureName' + this.id + '% recovers +' + amount + ' endurance');
		}
	}

	/**
	 * Restore remaining movement to a creature. Will be capped against the creature's
	 * maximum movement (this.stats.movement).
	 *
	 * @param {*} amount Number of movement points to restore.
	 */
	restoreMovement(amount: number, log = true) {
		this.remainingMove = Math.min(this.stats.movement, this.remainingMove + amount);

		if (log) {
			this.game.log('%CreatureName' + this.id + '% recovers +' + amount + ' movement');
		}
	}

	/* heal(amount)
	 *
	 * amount :	Damage :	Amount of health point to restore
	 */
	heal(amount: number, isRegrowth: boolean, log = true) {
		const game = this.game;
		// Cap health point
		amount = Math.min(amount, this.stats.health - this.health);

		if (this.health + amount < 1) {
			amount = this.health - 1; // Cap to 1hp
		}

		this.health += amount;

		// Health display Update
		this.updateHealth(isRegrowth);

		if (amount > 0) {
			if (isRegrowth) {
				this.hint('+' + amount + ' ♥', 'healing d' + amount);
			} else {
				this.hint('+' + amount, 'healing d' + amount);
			}

			if (log) {
				game.log('%CreatureName' + this.id + '% recovers +' + amount + ' health');
			}
		} else if (amount === 0) {
			if (isRegrowth) {
				this.hint('♦', 'msg_effects');
			} else {
				this.hint('!', 'msg_effects');
			}
		} else {
			if (isRegrowth) {
				this.hint(amount + ' ♠', 'damage d' + amount);
			} else {
				this.hint(amount + '', 'damage d ' + amount);
			}

			if (log) {
				game.log('%CreatureName' + this.id + '% loses ' + amount + ' health');
			}
		}

		// @ts-expect-error 2554
		game.onHeal(this, amount);
	}

	/* takeDamage(damage)
	 *
	 * damage :	Damage : 	Damage object
	 *
	 * return :	Object :	Contains damages dealt and if creature is killed or not
	 */
	takeDamage(damage: Damage, o) {
		const game = this.game;

		if (this.dead) {
			console.info(`${this.name} (${this.id}) is already dead, aborting takeDamage call.`);
			return;
		}

		const defaultOpt = {
			ignoreRetaliation: false,
			isFromTrap: false,
		};

		o = $j.extend(defaultOpt, o);
		// Determine if melee attack
		damage.melee = false;
		this.adjacentHexes(1).forEach((hex) => {
			if (damage.attacker == hex.creature) {
				damage.melee = true;
			}
		});

		damage.target = this;
		damage.isFromTrap = o.isFromTrap;

		// Trigger
		game.onUnderAttack(this, damage);
		game.onAttack(damage.attacker, damage);

		// Calculation
		if (damage.status === '') {
			// Damages
			const dmg = damage.applyDamage();
			const dmgAmount = dmg.total;

			if (!isFinite(dmgAmount)) {
				// Check for Damage Errors
				this.hint('Error', 'damage');
				game.log('Oops something went wrong !');

				return {
					damages: 0,
					kill: false,
				};
			}

			this.health -= dmgAmount;
			this.health = this.health < 0 ? 0 : this.health; // Cap

			this.addFatigue(dmgAmount);

			// Display
			const nbrDisplayed = dmgAmount ? '-' + dmgAmount : 0;
			this.hint(nbrDisplayed + '', 'damage d' + dmgAmount);

			if (!damage.noLog) {
				game.log('%CreatureName' + this.id + '% is hit : ' + nbrDisplayed + ' health');
			}

			// If Health is empty
			if (this.health <= 0) {
				this.die(damage.attacker);

				return {
					damages: dmg,
					damageObj: damage,
					kill: true,
				}; // Killed
			}

			// Effects
			damage.effects.forEach((effect) => {
				this.addEffect(effect);
			});

			// Unfreeze if taking non-zero damage and not a Cryostasis freeze.
			if (dmgAmount > 0 && !this.isInCryostasis()) {
				this.status.frozen = false;
			}

			// Health display Update
			// Note: update health after adding effects as some effects may affect
			// health display
			this.updateHealth();
			game.UI.updateFatigue();
			/* Some of the active creature's abilities may become active/inactive depending
			on new health/endurance values. */
			game.UI.checkAbilities();

			// Trigger
			if (!o.ignoreRetaliation) {
				// @ts-expect-error 2554
				game.onDamage(this, damage);
			}

			return {
				damages: dmg,
				damageObj: damage,
				kill: false,
			}; // Not Killed
		} else {
			if (damage.status == 'Dodged') {
				// If dodged
				if (!damage.noLog) {
					game.log('%CreatureName' + this.id + '% dodged the attack');
				}
			}

			if (damage.status == 'Shielded') {
				// If Shielded
				if (!damage.noLog) {
					game.log('%CreatureName' + this.id + '% shielded the attack');
				}
			}

			if (damage.status == 'Disintegrated') {
				// If Disintegrated
				if (!damage.noLog) {
					game.log('%CreatureName' + this.id + '% has been disintegrated');
				}
				this.die(damage.attacker);
			}

			// Hint
			this.hint(damage.status, 'damage ' + damage.status.toLowerCase());
		}

		return {
			damageObj: damage,
			kill: false,
		}; // Not killed
	}

	updateHealth(noAnimBar = false) {
		const game = this.game;

		if (this == game.activeCreature && !noAnimBar) {
			game.UI.healthBar.animSize(this.health / this.stats.health);
		}

		// Dark Priest plasma shield when inactive
		if (this.isDarkPriest()) {
			if (this.hasCreaturePlayerGotPlasma() && this !== game.activeCreature) {
				this.displayPlasmaShield();
			} else {
				this.displayHealthStats();
			}
		} else {
			this.displayHealthStats();
		}
	}

	displayHealthStats() {
		if (this.isFrozen()) {
			this.healthIndicatorSprite.loadTexture('p' + this.team + '_frozen');
		} else {
			this.healthIndicatorSprite.loadTexture('p' + this.team + '_health');
		}

		this.healthIndicatorText.setText(this.health + '');
	}

	displayPlasmaShield() {
		this.healthIndicatorSprite.loadTexture('p' + this.team + '_plasma');
		this.healthIndicatorText.setText(this.player.plasma.toString());
	}

	hasCreaturePlayerGotPlasma() {
		return this.player.plasma > 0;
	}

	addFatigue(dmgAmount: number) {
		if (!this.stats.fatigueImmunity) {
			this.endurance -= dmgAmount;
			this.endurance = this.endurance < 0 ? 0 : this.endurance; // Cap
		}

		this.game.UI.updateFatigue();
	}

	addEffect(
		effect: Effect,
		specialString?: string,
		specialHint?: string,
		disableLog = false,
		disableHint = false,
	) {
		const game = this.game;

		if (!effect.stackable && this.findEffect(effect.name).length !== 0) {
			return false;
		}

		effect.target = this;
		this.effects.push(effect);

		game.onEffectAttach(this, effect);

		this.updateAlteration();

		if (effect.name !== '') {
			if (!disableHint) {
				if (specialHint || effect.specialHint) {
					this.hint(specialHint, 'msg_effects');
				} else {
					this.hint(effect.name, 'msg_effects');
				}
			}

			if (!disableLog) {
				if (specialString) {
					game.log(specialString);
				} else {
					game.log('%CreatureName' + this.id + '% is affected by ' + effect.name);
				}
			}
		}
	}

	/** replaceEffect
	 * Add effect, but if the effect is already attached, replace it with the new
	 * effect.
	 * Note that for stackable effects, this is the same as addEffect()
	 */
	replaceEffect(effectToAdd: Effect) {
		if (!effectToAdd.stackable && this.findEffect(effectToAdd.name).length !== 0) {
			this.removeEffect(effectToAdd.name);
		}

		this.addEffect(effectToAdd);
	}

	/** removeEffect
	 * Remove an effect by name
	 */
	removeEffect(effectName: string) {
		const totalEffects = this.effects.length;

		for (let i = 0; i < totalEffects; i++) {
			if (this.effects[i].name === effectName) {
				this.effects.splice(i, 1);
				break;
			}
		}
	}

	hint(text: string, cssClass: string) {
		if (typeof Phaser === 'undefined') return;
		const game = this.game,
			tooltipSpeed = 250,
			tooltipDisplaySpeed = 500,
			tooltipTransition = Phaser.Easing.Linear.None;

		const hintColor = {
			confirm: {
				fill: '#ffffff',
				stroke: '#000000',
			},
			gamehintblack: {
				fill: '#ffffff',
				stroke: '#000000',
			},
			healing: {
				fill: '#00ff00',
			},
			msg_effects: {
				fill: '#ffff00',
			},
			creature_name: {
				fill: '#ffffff',
				stroke: '#AAAAAA',
			},
		};

		const style = $j.extend(
			{
				font: 'bold 20pt Play',
				fill: '#ff0000',
				align: 'center',
				stroke: '#000000',
				strokeThickness: 2,
			},
			hintColor[cssClass],
		);

		// Remove constant element
		this.hintGrp.forEach(
			(grpHintElem) => {
				if (grpHintElem.cssClass == 'confirm') {
					grpHintElem.cssClass = 'confirm_deleted';
					grpHintElem.tweenAlpha = game.Phaser.add
						.tween(grpHintElem)
						.to(
							{
								alpha: 0,
							},
							tooltipSpeed,
							tooltipTransition,
						)
						.start();
					grpHintElem.tweenAlpha.onComplete.add(function (this: any) {
						this.destroy;
					}, grpHintElem);
				}
			},
			this,
			true,
		);

		const hint = game.Phaser.add.text(0, 50, text, style);
		hint.anchor.setTo(0.5, 0.5);

		hint.alpha = 0;
		hint.cssClass = cssClass;

		if (cssClass === 'confirm') {
			hint.tweenAlpha = game.Phaser.add
				.tween(hint)
				.to(
					{
						alpha: 1,
					},
					tooltipSpeed,
					tooltipTransition,
				)
				.start();
		} else {
			hint.tweenAlpha = game.Phaser.add
				.tween(hint)
				.to(
					{
						alpha: 1,
					},
					tooltipSpeed,
					tooltipTransition,
				)
				.to(
					{
						alpha: 1,
					},
					tooltipDisplaySpeed,
					tooltipTransition,
				)
				.to(
					{
						alpha: 0,
					},
					tooltipSpeed,
					tooltipTransition,
				)
				.start();
			hint.tweenAlpha.onComplete.add(function (this: any) {
				this.destroy;
			}, hint);
		}

		this.hintGrp.add(hint);

		// Stacking
		this.hintGrp.forEach(
			(grpHintElem) => {
				const index = this.hintGrp.total - this.hintGrp.getIndex(grpHintElem) - 1;
				const offset = -50 * index;

				if (grpHintElem.tweenPos) {
					grpHintElem.tweenPos.stop();
				}

				grpHintElem.tweenPos = game.Phaser.add
					.tween(grpHintElem)
					.to(
						{
							y: offset,
						},
						tooltipSpeed,
						tooltipTransition,
					)
					.start();
			},
			this,
			true,
		);
	}

	/* updateAlteration()
	 *
	 * Update the stats taking into account the effects' alteration
	 *
	 */
	updateAlteration() {
		this.stats = { ...this.baseStats };

		const buffDebuffArray = [...this.effects, ...this.dropCollection];

		buffDebuffArray.forEach((buff) => {
			$j.each(buff.alterations, (key, value) => {
				if (typeof value === 'string') {
					// Multiplication Buff
					if (value.match(/\*/)) {
						this.stats[key] = eval(this.stats[key] + value);
					}

					// Division Debuff
					if (value.match(/\//)) {
						this.stats[key] = eval(this.stats[key] + value);
					}
				}

				// Usual Buff/Debuff
				if (typeof value == 'number') {
					this.stats[key] += value;
				}

				// Boolean Buff/Debuff
				if (typeof value == 'boolean') {
					this.stats[key] = value;
				}
			});
		});

		// Maximum stat pools cannot be lower than 1.
		this.stats.health = Math.max(this.stats.health, 1);
		this.stats.endurance = Math.max(this.stats.endurance, 1);
		this.stats.energy = Math.max(this.stats.energy, 1);
		this.stats.movement = Math.max(this.stats.movement, 1);

		// These stats cannot exceed their maximum values.
		this.health = Math.min(this.health, this.stats.health);
		this.endurance = Math.min(this.endurance, this.stats.endurance);
		this.energy = Math.min(this.energy, this.stats.energy);
		this.remainingMove = Math.min(this.remainingMove, this.stats.movement);
	}

	/* die()
	 *
	 * kill animation. remove creature from queue and from hexes
	 *
	 * killer :	Creature :	Killer of this creature
	 *
	 */
	die(killerCreature: Creature | { player: Player }) {
		const game = this.game;

		game.log('%CreatureName' + this.id + '% is dead');

		this.dead = true;

		// Triggers
		// @ts-expect-error 2554
		game.onCreatureDeath(this);

		this.killer = killerCreature.player;
		const isDeny = this.killer.flipped == this.player.flipped;

		// Drop item
		if (game.unitDrops == 1 && this.drop) {
			const offsetX = this.player.flipped ? this.x - this.size + 1 : this.x;
			const { name, ...alterations } = this.drop;
			new Drop(name, alterations, offsetX, this.y, game);
		}

		if (!game.firstKill && !isDeny) {
			// First Kill
			this.killer.score.push({
				type: 'firstKill',
			});
			game.firstKill = true;
		}

		if (this.isDarkPriest()) {
			// If Dark Priest
			if (isDeny) {
				// TEAM KILL (DENY)
				this.killer.score.push({
					type: 'deny',
					creature: this,
				});
			} else {
				// Humiliation
				this.killer.score.push({
					type: 'humiliation',
					player: this.team,
				});
			}
		}

		if (!this.undead) {
			// Only if not undead
			if (isDeny) {
				// TEAM KILL (DENY)
				this.killer.score.push({
					type: 'deny',
					creature: this,
				});
			} else {
				// KILL
				this.killer.score.push({
					type: 'kill',
					creature: this,
				});
			}
		}

		if (this.player.isAnnihilated()) {
			// Remove humiliation as annihilation is an upgrade
			const total = this.killer.score.length;
			for (let i = 0; i < total; i++) {
				const s = this.killer.score[i];
				if (s.type == 'humiliation') {
					if (s.player == this.team) {
						this.killer.score.splice(i, 1);
					}

					break;
				}
			}
			// ANNIHILATION
			this.killer.score.push({
				type: 'annihilation',
				player: this.team,
			});
		}

		if (this.isDarkPriest()) {
			this.player.deactivate(); // Here because of score calculation
		}

		// Kill animation
		const tweenSprite = game.Phaser.add
			.tween(this.sprite)
			.to(
				{
					alpha: 0,
				},
				500,
				Phaser.Easing.Linear.None,
			)
			.start();
		const tweenHealth = game.Phaser.add
			.tween(this.healthIndicatorGroup)
			.to(
				{
					alpha: 0,
				},
				500,
				Phaser.Easing.Linear.None,
			)
			.start();
		tweenSprite.onComplete.add(() => {
			this.sprite.destroy();
		});
		tweenHealth.onComplete.add(() => {
			this.healthIndicatorGroup.destroy();
		});

		this.cleanHex();

		game.queue.update();
		game.updateQueueDisplay();
		game.grid.updateDisplay();

		if (game.activeCreature === this) {
			game.nextCreature();
			return;
		} // End turn if current active creature die

		// As hex occupation changes, path must be recalculated for the current creature not the dying one
		game.activeCreature.queryMove();
	}

	isFatigued() {
		return this.endurance === 0;
	}

	isFragile() {
		return this.stats.endurance === 1;
	}

	/* getHexMap()
	 *
	 * shortcut convenience function to grid.getHexMap
	 */
	getHexMap(map: AugmentedMatrix, invertFlipped: boolean) {
		const x = (this.player.flipped ? !invertFlipped : invertFlipped)
			? this.x + 1 - this.size
			: this.x;
		return this.game.grid.getHexMap(
			x,
			this.y - map.origin[1],
			0 - map.origin[0],
			this.player.flipped ? !invertFlipped : invertFlipped,
			map,
		);
	}

	findEffect(name) {
		const ret = [];

		this.effects.forEach((effect) => {
			if (effect.name == name) {
				ret.push(effect);
			}
		});

		return ret;
	}

	// Make units transparent
	xray(enable: boolean) {
		const game = this.game;

		if (enable) {
			game.Phaser.add
				.tween(this.grp)
				.to(
					{
						alpha: 0.5,
					},
					250,
					Phaser.Easing.Linear.None,
				)
				.start();
		} else {
			game.Phaser.add
				.tween(this.grp)
				.to(
					{
						alpha: 1,
					},
					250,
					Phaser.Easing.Linear.None,
				)
				.start();
		}
	}

	pickupDrop() {
		getPointFacade()
			.getDropsAt(this)
			.forEach((drop) => drop.pickup(this));
	}

	/**
	 * Get movement type for this creature
	 */
	movementType(): string {
		const totalAbilities = this.abilities.length;

		// If the creature has an ability that modifies movement type, use that,
		// otherwise use the creature's base movement type
		for (let i = 0; i < totalAbilities; i++) {
			if ('movementType' in this.abilities[i]) {
				return this.abilities[i].movementType();
			}
		}

		return this._movementType;
	}

	/**
	 * Is this unit a Dark Priest?
	 */
	isDarkPriest(): boolean {
		return this.type === '--';
	}

	/**
	 * Does the creature have the Frozen status? @see status.frozen
	 */
	isFrozen(): boolean {
		return this.status.frozen;
	}

	/**
	 * Does the creature have the Cryostasis status? @see status.cryostasis
	 */
	isInCryostasis(): boolean {
		return this.isFrozen() && this.status.cryostasis;
	}

	/**
	 * Same as the "Frozen" status, but with a different name.
	 *
	 * TODO: Refactor to a generic "skip turn" status that can be customised.
	 */
	isDizzy(): boolean {
		return this.status.dizzy;
	}

	/**
	 * Freeze a creature, skipping its next turn. @see status.frozen
	 */
	freeze(cryostasis = false) {
		this.status.frozen = true;

		if (cryostasis) {
			this.status.cryostasis = true;
		}

		// Update the health box under the creature cardboard with frozen effect.
		this.updateHealth();
		// Show frozen fatigue text effect in queue.
		this.game.UI.updateFatigue();

		this.game.signals.creature.dispatch('frozen', { creature: this, cryostasis });
	}

	get fatigueText(): string {
		let result = '';
		if (this.isFrozen()) {
			result = this.isInCryostasis() ? 'Cryostasis' : 'Frozen';
		} else if (this.isDizzy()) {
			result = 'Dizzy';
		} else if (this.materializationSickness) {
			result = 'Sickened';
		} else if (this.protectedFromFatigue || this.stats.fatigueImmunity) {
			result = 'Protected';
		} else if (this.isFragile()) {
			result = 'Fragile';
			// Display message if the creature has first become fragile

			// TODO: This isn't necessarily the moment the creature has
			// become fragile. The code will run twice if, e.g.,
			// the creature is fragile, then fragile and dizzy, then fragile
			if (this.#fatigueText !== result) {
				this.game.log('%CreatureName' + this.id + '% has become fragile');
			}
		} else if (this.isFatigued()) {
			result = 'Fatigued';
		} else {
			result = this.endurance + '/' + this.stats.endurance;
		}

		if (this.isDarkPriest()) {
			// If Dark Priest
			this.abilities[0].require(); // Update protectedFromFatigue
		}

		this.#fatigueText = result;
		return result;
	}
}
