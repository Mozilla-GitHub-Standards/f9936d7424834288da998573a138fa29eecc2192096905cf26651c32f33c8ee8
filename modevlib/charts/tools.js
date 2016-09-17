/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

importScript("../../lib/d3/d3.js");
importScript("../collections/aArray.js");

(function(){ //BETTER D3

	//SOME ATTRIBUTES THAT CAN BE FUNCTIONS BY SAME NAME
	[d3.selection.prototype, d3.transition.prototype].forall(function(proto){

		["cx", "cy", "x", "y", "width", "height"].forall(function(name){
			proto[name] = function(){
				return proto.attr.apply(this, [name].appendArray(arguments));
			}
		});
		["fill", "visibility"].forall(function(name){
			proto[name] = function(){
				return proto.style.apply(this, [name].appendArray(arguments));
			}
		});

		//style() NO LONGER ACCEPTS OBJECTS
		var style = d3.selection.prototype.style;
		proto.style = function(){
			if (arguments.length == 1 && !isString(arguments[0])) {
				var self = this;
				Map.forall(arguments[0], function(key, value){
					self = style.apply(self, [key, value]);
				});//forall
				return self;
			}//endif
			return style.apply(this, arguments);
		};

		//TRANSFORMS COULD BE DONE EASIER TOO
		function transform(){
			return (function(self, name, params){
				return self.each(function(d, i){
					var acc = this.getAttribute("transform");
					var value = name + "(" + params.map(function(f){
							return isFunction(f) ? f(d, i) : f;
						}).join(",") + ")";
					this.setAttribute("transform", value + " " + coalesce(acc, ""));
				});
			})(this, arguments[0], Array.prototype.slice.call(arguments, 1));
		}

		["translate", "rotate"].forall(function(name){
			proto[name] = function(){
				return transform.apply(this, [name].appendArray(arguments));
			}
		});


	});


	var prototype = function(){};

	var Deferral = function(selection){
		var self = {};
		var func = function(){
			var sel = func.selection;
			func.accumulator.forall(function(action){
				sel = sel[action.attr].apply(sel, action.args);
			});
		};
		func.selection = selection;
		func.accumulator = [];
		func.__proto__ = prototype;
		return func;
	};

	["cx", "cy", "x", "y", "width", "height", "fill", "visibility", "style", "attr", "translate", "rotate", "append", "text"]
		.forall(function(attr){
			prototype[attr]=function(){
				this.accumulator.append({attr: attr, args: arguments});
				return this;
			}
		});

	prototype.transition = function(){
		this.selection = this.selection.transition();
		return this();
	};

	//prototype.immediate = function(){
	//	return this.selection;
	//};

	d3.selection.prototype.defer = function(){
		return new Deferral(this);
	}


})();


