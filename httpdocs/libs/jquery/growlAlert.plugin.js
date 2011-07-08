(function( $ ){
    /**
    *
    * growAlert plugin by Luke Stebner (luke.stebner@gmail.com)
    * created on 2.20.2011 | last modified 2.21.2011
    * 
    * This little plugin is used to create little alert messages in the style that Growl works. It was
    * created as a tutorial demo for programming.linnnk.com, but due to popularity I've decided to flush
    * it out into a more useful piece of code than just the basic alert functionality. 
    *
    * If you stumbled upon this piece of code and don't know where it originated, you can head over to it's
    * github location here: https://github.com/lstebner/jQuery-Growl-Alert-Plugin
    *
    * My growlAlert plugin is free for anyone to use however they see fit, though I ask that you ping me
    * back if you do anything really cool with it because I'd love to check it out and/or show it off. 
    *
    * 
    * Params:
    * @opts     <string or object>  Either a method name to call or an object of settings on initialization
    *       settings {
    *           autoShow : true/false - Show this message right away or wait for 'show' call
    *           fadeTime : milliseconds - The amount of time over which to fadeIn and fadeOut
    *           delayTime : milliseconds - The amount of time to leave the message displayed before fadeOut call
    *           title : string - The title to use for the alert
    *           content: string - The content for the growl alert
    *           closeIcon: string - The path to the image to use as the close icon
    *           onShow: function - A callback function for when the message is fully displayed
    *           onComplete: function - A callback function for when the message has disappeared (completed)
    *           position: string - Where to position the alert (top-left, top-right, bottom-left, bottom-right)
    *       }
    *       methods{
    *           - show(settings) - Show the message immediately on call 
    *               @settings   <object>    Any settings data to override immediately
    *       }
    *
    * @data     <object>            An object of data to pass with the method call specified for 'opts'
    *
    */
	$.fn.growlAlert = function(opts, data){
	    //settings for growl
		var settings = {
			autoShow : true,
			fadeTime : 600,
			delayTime : 1500,
			title : 'Growl Alert Title',
			content : 'This is the content for the growl alert test message, woo!',
			closeIcon : 'http://www.linnnk.com/demos/images/close-icon.png',
			onShow: null,
			onComplete: null,
			position: 'top-left'
		};
		
	    if (this.html() == ''){
    		this.html('<a href="#" class="close-link"><img src="' + settings.closeIcon + '" width="20px" height="20px" /></a><div class="title"></div><div class="content"></div>');
	    }
	    
		$self = this;
        $close = this.find('.close-link');
		$title = this.children('.title');
		$content = this.children('.content');
		
		//methods for growl
		methods = {
		    set: function(key, val){
		        switch(key){
		            case 'title':
		                $title.text(val);
		                break;
		            
		            case 'content':
		                $content.text(val);
		                break;
		                
		            case 'position':
		                $self.removeClass('top-left').removeClass('top-right').removeClass('bottom-left').removeClass('bottom-right').addClass(val);
		                break;
		        }
		    },
		    onComplete: function(){
		        if (settings.onComplete){
		            settings.onComplete();
		        }
		    },
		    onShow: function(){
		        if (settings.onShow){
		            settings.onShow();
		        }
		    },
			show : function(data){
			    if ($self.is(':visible')){
			        old = methods.onComplete();
			        methods.onComplete = function(){
                        if (old){
                            old();
                        }
                        
                        $self.growlAlert('show', data);
			        }
			    }
			    else{
    			    if (data){
    			        if (data.title){
                            methods.set('title', data.title);
    			        }
    			        if (data.content){
                            methods.set('content', data.content);
    			        }
    			        if (data.position){
    			            methods.set('position', data.position);
    		            }
		        
    			        $.extend(settings, data);
    			    }
		    
    				return $self.fadeIn(settings.fadeTime, function(){ methods.onShow(); })
    				            .delay(settings.delayTime)
    				            .fadeOut(settings.fadeTime, function(){ methods.onComplete(); });
    			}
			}
		};
		
		//if some sort of opts was passed in
		if (opts){
			//check to see if it's a method
			if (methods[opts]){
				return methods[opts](data);
			}
			//otherwise just treat it as options
			else{
				$.extend(settings, opts);
			}
		}
		
		if (!this.hasClass(settings.position)){
		    methods.set('position', settings.position);
		}
		
		//objects
		this.hide();
		
		//set the text
		methods.set('title', settings.title);
		methods.set('content', settings.content);
		
		//close button click
		$close.click(function(){
			//stop any animations running now
			$self.stop(true, true);
			//fade out the dialog
			$self.fadeOut(settings.fadeTime, function(){ methods.onComplete(); });
			//prevent default action on the close link
			return false;
		});
		
		//show immediately
		if (settings.autoShow){
		    return $self.growlAlert('show');
		}
	}
})( jQuery );