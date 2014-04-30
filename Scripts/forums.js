
function Forum_CreateTopic( pageid )
{
	if ( g_rgForums[pageid] )
		g_rgForums[pageid].DisplayNewTopicForm();
}

function Forum_Subscribe( pageid )
{
	if ( g_rgForums[pageid] )
		g_rgForums[pageid].SubscribeToForum();
}

function Forum_Unsubscribe( pageid )
{
	if ( g_rgForums[pageid] )
		g_rgForums[pageid].UnsubscribeFromForum();
}

function Forum_SetTopicsPerPage( cTopicsPerPage )
{
	new Ajax.Request( 'http://steamcommunity.com/forum/0/0/setpreference', {
		parameters: {preference: 'topicsperpage', value: cTopicsPerPage, sessionid: g_sessionID },
		onComplete: function() { window.location.reload() }
	} );
}

function Forum_SetTopicRepliesPerPage( cTopicRepliesPerPage )
{
	new Ajax.Request( 'http://steamcommunity.com/forum/0/0/setpreference', {
		parameters: {preference: 'topicrepliesperpage', value: cTopicRepliesPerPage, sessionid: g_sessionID },
		onComplete: function() { window.location.reload() }
	} );
}

function Forum_CancelEvent( event )
{
	if ( !event )
		event = window.event;

	if ( event.stopPropagation )
		event.stopPropagation();
	else
		event.cancelBubble = true;
}

function Forum_InitTooltips()
{
	$J('.forum_topic[data-tooltip-content], .forum_topic_link[data-tooltip-content]').tooltip( {
		'location':'bottom',
		trackMouse: true,
		'tooltipClass': 'forum_topic_tooltip',
		offsetY: 6,
		fadeSpeed: 0,
		trackMouseCentered: false
	});
}

var g_rgForums = {};
function InitializeForum( name, rgForumData, url )
{
	g_rgForums[ name ] = new CForum( name, rgForumData, url );
}

var CForum = Class.create( {

	m_strName: null,
	m_rgForumData: null,
	m_strActionURL: null,
	m_cPageSize: null,

	m_cTotalCount: 0,
	m_iCurrentPage: 0,
	m_iInitialPage: 0,
	m_cMaxPages: 0,
	m_bLoading: false,
	m_bSubmittingTopic: false,
	m_bNewTopicFormDisplayed: false,
	m_rgCreateTopicFlags: null,


	initialize: function( name, rgForumData, url )
	{
		this.m_strName = name;
		this.m_rgForumData = rgForumData;
		this.m_strActionURL = url;

		this.m_cTotalCount = rgForumData['total_count'];
		this.m_cPageSize = rgForumData['pagesize'];
		this.m_iCurrentPage = this.m_iInitialPage = Math.floor( ( rgForumData.start || 0 ) / this.m_cPageSize );
		this.m_cMaxPages = Math.ceil( this.m_cTotalCount / this.m_cPageSize );

		var strPrefix = 'forum_' + this.m_strName;

		var elForm = $( strPrefix + '_newtopic_form' );
		if ( elForm )
		{
			elForm.observe( 'submit', this.NewTopic.bind( this ) );
		}

		this.m_elTextArea = $( strPrefix + '_textarea');

		if ( this.m_elTextArea )
		{
			new CAutoSizingTextArea( this.m_elTextArea, 40, this.OnTextInput.bind(this) );
		}

		BindOnHashChange( this.OnLocationChange.bind(this) );
		this.OnLocationChange( window.location.hash );


		$(strPrefix + '_pagebtn_prev').observe( 'click', this.OnPagingButtonClick.bindAsEventListener( this , this.PrevPage ) );
		$(strPrefix + '_footerpagebtn_prev') && $(strPrefix + '_footerpagebtn_prev').observe( 'click', this.OnPagingButtonClick.bindAsEventListener( this , this.PrevPage ) );
		$(strPrefix + '_pagebtn_next').observe( 'click', this.OnPagingButtonClick.bindAsEventListener( this , this.NextPage ) );
		$(strPrefix + '_footerpagebtn_next') && $(strPrefix + '_footerpagebtn_next').observe( 'click', this.OnPagingButtonClick.bindAsEventListener( this , this.NextPage ) );

		Forum_InitTooltips();
		this.UpdatePagingDisplay();
	},

	DisplayNewTopicForm: function()
	{
		if ( !this.m_bNewTopicFormDisplayed )
		{
			if( !$('forum_' + this.m_strName + '_newtopic_area').visible() )
				new Effect.BlindDown( 'forum_' + this.m_strName + '_newtopic_area', { duration: 0.25 } );

			var $Form = $J('#forum_' + this.m_strName + '_newtopic_form');

			if ( $Form.length )
			{
				var _this = this;
				$Form.find( '[name=subforum]' ).change( function() { _this.UpdateCreateTopicFormDisplay(); } );

				if ( !this.m_rgCreateTopicFlags )
				{
					new Ajax.Request( this.GetActionURL( 'getcreatetopicflags' ), {
						method: 'get',
						onSuccess: function( transport ) { _this.m_rgCreateTopicFlags = transport.responseJSON || {}; _this.UpdateCreateTopicFormDisplay(); },
						onFailure: function( transport ) { _this.m_rgCreateTopicFlags = {}; _this.UpdateCreateTopicFormDisplay(); }
					});
				}
			}

			this.m_bNewTopicFormDisplayed = true;
		}
	},

	UpdateCreateTopicFormDisplay: function()
	{
		var strForumType = this.m_rgForumData.type;

		var elForm = $('forum_' + this.m_strName + '_newtopic_form');
		var elSubforumSelect = elForm.elements['subforum'];
		if ( elSubforumSelect )
		{
			// see if they've selected a different type
			if ( elSubforumSelect.length )
			{
				// radio buttons
				for ( var i=0; i < elSubforumSelect.length; i++ )
				{
					if ( elSubforumSelect[i].checked )
					{
						strForumType = elSubforumSelect[i].value.replace( /_.*$/, '' );
						break;
					}
				}
			}
			else if ( elSubforumSelect.value )
			{
				strForumType = elSubforumSelect.value.replace( /_.*$/, '' );
			}
		}

		var elInfoMessage = $('forum_' + this.m_strName + '_newtopic_info' );
		if ( this.m_rgCreateTopicFlags !== null && strForumType == 'Trading' )
		{
			var strMessage = 'If your inventory privacy is public, community members will be able to send you trade offers from this topic.';
			if ( this.m_rgCreateTopicFlags.inventory_public )
				strMessage = '<b>Your inventory privacy is set to Public</b>.  This means community members can send you trade offers from this topic.  If your inventory privacy is set to anything other than Public, you cannot receive Community trade offers.';
			else if ( typeof this.m_rgCreateTopicFlags.inventory_public != 'undefined' )
				strMessage = '<b>Your inventory privacy is <u>not</u> Public</b>.  This means community members will not be able to send you trade offers from this topic.  If your inventory privacy was Public, community members would be able to send you trade offers from this topic.';

			strMessage += '<div class="forum_newtopic_info_rule"></div>';
			strMessage += '<img class="forum_newtopic_info_trade_closebuttondemo" src="http://cdn.steamcommunity.com/public/images/skin_1/forum_img_closetopic.png">';
			strMessage += 'When you are done receiving trade offers or have completed the trade, you can close this topic and disallow trade offers from here.';
			strMessage += '<div style="clear: both;"></div>';

			elInfoMessage.update( strMessage );

			elInfoMessage.show();
		}
		else
		{
			elInfoMessage.hide();
		}
	},

	OnTextInput: function( elTextArea )
	{
	},

	NewTopic: function()
	{
		if ( this.m_bSubmittingTopic )
			return false;

		var form = $('forum_' + this.m_strName + '_newtopic_form' );
		if ( form.elements['topic'].value.length > 0 && form.elements['text'].value.length > 0 )
		{
			this.m_bSubmittingTopic = true;
			$('forum_' + this.m_strName + '_newtopic_error' ).hide();
			$('forum_' + this.m_strName + '_submit_container').hide();
			$('forum_' + this.m_strName + '_submit_throbber_container').show();

			var strName = this.m_strName;

			new Ajax.Request( this.GetActionURL( 'createtopic' ), {
					method: 'post',
					parameters: form.serialize(),
					onSuccess: this.OnNewTopicSuccess.bind( this ),
					onFailure: this.OnNewTopicFailure.bind( this )
			} );
		}

		return false;
	},

	OnNewTopicSuccess: function( transport )
	{
		this.m_bSubmittingTopic = false;
		var rgJSON = transport.responseJSON || {};

		if ( rgJSON.topic_url )
		{
			window.location = rgJSON.topic_url;
		}
	},

	OnNewTopicFailure: function( transport )
	{
		this.m_bSubmittingTopic = false;
		var rgJSON = transport.responseJSON || {};
		$('forum_' + this.m_strName + '_newtopic_error' ).update( 'There was an error creating a new topic: ' + ( rgJSON.error ? rgJSON.error : rgJSON.success ) );
		new Effect.Appear( $('forum_' + this.m_strName + '_newtopic_error' ), { duration: 0.5 } );

		$('forum_' + strName + '_submit_container').show();
		$('forum_' + strName + '_submit_throbber_container').hide();
	},

	GetActionURL: function( action )
	{
		var url = this.m_strActionURL + action + '/';
		if ( this.m_rgForumData['feature'] )
			url += this.m_rgForumData['feature'] + '/';
		return url;
	},

	OnAJAXComplete: function()
	{
		this.m_bLoading = false;
	},

	OnLocationChange: function( hash )
	{
		if ( hash.match( /^#p[0-9]+$/ ) )
		{
			var iPage = parseInt( hash.substring(2) ) - 1;
			if ( this.m_iCurrentPage != iPage )
				this.GoToPage( iPage );
		}
		else if ( !hash )
		{
			// reset to initial view
			this.GoToPage( this.m_iInitialPage );
		}
	},

	OnPagingButtonClick: function( event, fnToExecute )
	{
		event.stop();
		fnToExecute.call( this );
	},

	NextPage: function()
	{
		if ( this.m_iCurrentPage < this.m_cMaxPages - 1 )
			this.GoToPage( this.m_iCurrentPage + 1 );
	},

	PrevPage: function()
	{
		if ( this.m_iCurrentPage > 0 )
			this.GoToPage( this.m_iCurrentPage - 1 );
	},

	ReloadCurrentPage: function()
	{
		this.GoToPage( this.m_iCurrentPage, true /* force */ );
	},

	GoToPage: function( iPage, bForce )
	{
		if ( this.m_bLoading || iPage >= this.m_cMaxPages || iPage < 0 || ( iPage == this.m_iCurrentPage && !bForce ) )
			return;

		var params = {
			start: this.m_cPageSize * iPage,
			count: this.m_cPageSize
		};
		if ( this.m_rgForumData['extended_data'] )
			params['extended_data'] = this.m_rgForumData['extended_data'];

		this.m_bLoading = true;
		new Ajax.Request( this.GetActionURL( 'render' ), {
			method: 'get',
			parameters: params,
			onSuccess: this.OnResponseRenderTopics.bind( this ),
			onComplete: this.OnAJAXComplete.bind( this )
		});
	},

	OnResponseRenderTopics: function( transport, bNewTopic )
	{
		if ( transport.responseJSON )
		{
			var response = transport.responseJSON;
			this.m_cTotalCount = response.total_count;
			this.m_cMaxPages = Math.ceil( response.total_count / this.m_cPageSize );
			this.m_iCurrentPage = Math.floor( response.start / this.m_cPageSize );

			if ( this.m_cTotalCount <= response.start )
			{
				// this page is no logner valid, flip back a page (deferred so that the AJAX handler exits and reset m_bLoading)
				this.GoToPage.bind( this, this.m_iCurrentPage - 1 ).defer();
				return;
			}

			var elTopics = $('forum_' + this.m_strName + '_topics' );
			var elContainer = $('forum_' + this.m_strName + '_topiccontainer' );

			elTopics.update( response.topics_html );


			if ( this.m_iCurrentPage != this.m_iInitialPage || window.location.hash.length > 1)
			{
				if ( this.m_iCurrentPage != this.m_iInitialPage )
					window.location.hash = 'p' + ( this.m_iCurrentPage + 1);
				else
					window.location.hash = '';
			}

			ScrollToIfNotInView($('forum_' + this.m_strName + '_area' ), 40 );

			this.UpdatePagingDisplay();
			Forum_InitTooltips();
		}
	},

	UpdatePagingDisplay: function()
	{
		var strPrefix = 'forum_' + this.m_strName;


		var rgPagingControls = [ strPrefix + '_page' , strPrefix + '_footerpage' ];
		for ( var i = 0; i < rgPagingControls.length; i++ )
		{
			var strPagePrefix = rgPagingControls[i];

			// we may not always show both sets of controls
			if ( !$(strPagePrefix + 'controls' ) )
				continue;

			$(strPagePrefix + 'total').update( v_numberformat( this.m_cTotalCount ) );
			$(strPagePrefix + 'start').update( v_numberformat( this.m_iCurrentPage * this.m_cPageSize + 1 ) );
			$(strPagePrefix + 'end').update( Math.min( ( this.m_iCurrentPage + 1 ) * this.m_cPageSize, this.m_cTotalCount ) );


			if ( this.m_cMaxPages <= 1 )
			{
				$(strPagePrefix + 'controls').hide();
			}
			else
			{
				$(strPagePrefix + 'controls').show();
				if ( this.m_iCurrentPage > 0 )
					$(strPagePrefix + 'btn_prev').removeClassName('disabled');
				else
					$(strPagePrefix + 'btn_prev').addClassName('disabled');

				if ( this.m_iCurrentPage < this.m_cMaxPages - 1 )
					$(strPagePrefix + 'btn_next').removeClassName('disabled');
				else
					$(strPagePrefix + 'btn_next').addClassName('disabled');

				var elPageLinks = $(strPagePrefix + 'links');
				elPageLinks.update('');
				// we always show first, last, + 3 page links closest to current page
				var cPageLinksAheadBehind = 2;
				var firstPageLink = Math.max( this.m_iCurrentPage - cPageLinksAheadBehind, 1 );
				var lastPageLink = Math.min( this.m_iCurrentPage + (cPageLinksAheadBehind*2) + ( firstPageLink - this.m_iCurrentPage ), this.m_cMaxPages - 2 );

				if ( lastPageLink - this.m_iCurrentPage < cPageLinksAheadBehind )
					firstPageLink = Math.max( this.m_iCurrentPage - (cPageLinksAheadBehind*2) + ( lastPageLink - this.m_iCurrentPage ), 1 );

				this.AddPageLink( elPageLinks, 0 );
				if ( firstPageLink != 1 )
					elPageLinks.insert( ' ... ' );

				for ( var iPage = firstPageLink; iPage <= lastPageLink; iPage++ )
				{
					this.AddPageLink( elPageLinks, iPage );
				}

				if ( lastPageLink != this.m_cMaxPages - 2 )
					elPageLinks.insert( ' ... ' );
				this.AddPageLink( elPageLinks, this.m_cMaxPages - 1 );
			}
		}
	},

	AddPageLink: function( elPageLinks, iPage )
	{
		var el = new Element( 'span', {'class': 'forum_paging_pagelink' } );
		el.update( (iPage + 1) + ' ' );

		if ( iPage == this.m_iCurrentPage )
			el.addClassName( 'active' );
		else
			el.observe( 'click', this.GoToPage.bind( this, iPage ) );

		elPageLinks.insert( el );
	},

	SubscribeToForum: function()
	{
		var strPrefix = 'forum_' + this.m_strName;
		this.m_bLoading = true;
		new Ajax.Request( this.GetActionURL( 'subscribe' ), {
			method: 'POST',
			parameters: {sessionid: g_sessionID},
			onSuccess: function() { $(strPrefix + '_subscribe').hide(); $(strPrefix + '_unsubscribe').show(); },
			onFailure: function() { ShowForumModalSuccess( 'There was an error subscribing to this forum.', 'Please try again later.' ); },
			onComplete: this.OnAJAXComplete.bind( this )
		});
	},

	UnsubscribeFromForum: function()
	{
		var strPrefix = 'forum_' + this.m_strName;
		this.m_bLoading = true;
		new Ajax.Request( this.GetActionURL( 'unsubscribe' ), {
			method: 'POST',
			parameters: {sessionid: g_sessionID},
			onSuccess: function() { $(strPrefix + '_unsubscribe').hide(); $(strPrefix + '_subscribe').show(); },
			onFailure: function() { ShowForumModalSuccess( 'There was an error unsubscribing from this forum.', 'Please try again later.' ); },
			onComplete: this.OnAJAXComplete.bind( this )
		});
	}

} );

var g_rgForumTopics = {};
var g_rgForumTopicCommentThreads = {};
function InitializeForumTopic( rgForumData, url, gidTopic, rgRawData )
{
	g_rgForumTopics[ gidTopic ] = new CForumTopic( rgForumData, url, gidTopic, rgRawData );
}

function RegisterForumTopicCommentThread( gidTopic, CommentThread )
{
	g_rgForumTopicCommentThreads[ gidTopic ] = CommentThread;
}

function Forum_DeleteTopic( gidTopic )
{
	ShowConfirmDialog('Delete Thread ',
		'Are you sure you want to delete this thread? ' +
		'This action can only be undone by a moderator.',
		'Delete Thread'
	).done( function() {
		Forum_DoDeleteTopic( gidTopic );
	});
}

function Forum_DoDeleteTopic( gidTopic )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].Delete();
}

function Forum_PurgeTopic( gidTopic )
{
	ShowConfirmDialog('Permanently Delete ',
		'Are you sure you want to permanently delete this topic?  This cannot be undone.',
		'Permanently Delete'
	).done( function() {
		Forum_SetTopicFlag( gidTopic, 'purge', true );
	});
}

function Forum_SetTopicFlag( gidTopic, flag, value )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].SetTopicFlag( flag, value );
}

function Forum_ReportPost( gidTopic, author, gidComment )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].ReportPost( author, gidComment );
}

function Forum_MoveTopic( gidTopic )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].MoveTopic();
}

function Forum_MergeTopic( gidTopic )
{
	if ( g_rgForumTopics[ gidTopic ] )
	{
		var Topic = g_rgForumTopics[ gidTopic ];
		Forum_MergeTopicDialog( Topic.GetActionURL( 'mergetopics' ), Topic.m_rgForumData, [ gidTopic ] )
			.done( function( transport ) {

				// the transport is from prototype
				var strNewURL = Topic.m_rgForumData['forum_url'];
				if ( transport && transport.responseJSON && transport.responseJSON.newtopic )
					strNewURL = transport.responseJSON.newtopic;

				if ( strNewURL )
				{
					ShowConfirmDialog(
						'Merge Topics',
						'The selected topics have been merged into a single topic.',
						'Go to the merged topic',
						'Return to topic list'
					).done( function() {
						window.location = strNewURL;
					}).fail( function() {
						window.location = Topic.m_rgForumData['forum_url'];
					});
				}
			});
	}
}

function Forum_SubscribeToTopic( gidTopic )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].Subscribe( Forum_SwapSubscribeButtons.bind( null, gidTopic, true ) );
}

function Forum_UnsubscribeFromTopic( gidTopic )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].Unsubscribe( Forum_SwapSubscribeButtons.bind( null, gidTopic, false ) );
}

function Forum_ResolveReports( gidTopic )
{
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].ResolveReports();
}

function Forum_SwapSubscribeButtons( gidForumTopic, bSubscribed )
{
	if ( bSubscribed )
	{
		$('forum_subscribe_' + gidForumTopic).hide();
		$('forum_unsubscribe_' + gidForumTopic).show();
	}
	else
	{
		$('forum_subscribe_' + gidForumTopic).show();
		$('forum_unsubscribe_' + gidForumTopic).hide();
	}
}

function Forum_SubmitReport( elForm )
{
	var gidTopic = elForm.elements['gidtopic'].value;

	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].SubmitReportPost();
}

function Forum_EditTopic( gidTopic )
{
	$('forum_op_' + gidTopic).hide();
	$('forum_topic_edit_' + gidTopic).show();

	// size the text box to the content
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].CheckTextAreaSize();
}

function Forum_CancelEditTopic( gidTopic )
{
	$('forum_op_' + gidTopic).show();
	$('forum_topic_edit_' + gidTopic).hide();
}

function Forum_SubmitTopicChanges( gidTopic, form )
{
	var title = form.elements['topic'].value;
	var text = form.elements['text'].value;
	if ( g_rgForumTopics[ gidTopic ] )
		g_rgForumTopics[ gidTopic ].Edit( title, text );
}

function Forum_EraseNestedQuotes( strText )
{
	var strOutput = '';

	var iCur = 0;
	var nQuoteLevel = 0;
	var iNextQuote = strText.indexOf( '[quote' );
	var iNextEndQuote = strText.indexOf( '[/quote]' );
	while( iNextQuote != -1 || iNextEndQuote != -1 )
	{
		if ( iNextQuote != -1 && iNextQuote < iNextEndQuote )
		{
			if ( nQuoteLevel < 2 )
				strOutput += strText.substr( iCur, iNextQuote - iCur );
			iCur = iNextQuote;
			iNextQuote = strText.indexOf( '[quote', iCur + 1 );
			nQuoteLevel++;
		}
		else
		{
			if ( nQuoteLevel < 2 )
			{
				strOutput += strText.substr( iCur, iNextEndQuote + 8 - iCur );
			}
			iCur = iNextEndQuote + 8;	// strlen( '[/quote]' )
			iNextEndQuote = strText.indexOf( '[/quote', iCur + 1 );
			nQuoteLevel--;
		}
	}
	strOutput += strText.substr( iCur );

	return strOutput;
}

function Forum_ReplyToPost( gidTopic, gidComment )
{
	var CommentThread = g_rgForumTopicCommentThreads[gidTopic];
	var rgRawComment;
	if ( gidComment && gidComment != -1 )
	{
		rgRawComment = CommentThread.GetRawComment( gidComment );
	}
	else
	{
		// topic quoting
		rgRawComment = g_rgForumTopics[gidTopic].m_rgRawData;
	}

	var elTextArea = CommentThread.GetCommentTextEntryElement();


	if ( elTextArea.value && elTextArea.value.length > 0 )
		elTextArea.value += '\n\n';
	elTextArea.value += '[quote=' + rgRawComment.author.replace( /[\[\];]/g, '' );

	if ( gidComment && gidComment != -1 )
		elTextArea.value += ';' + gidComment;

	elTextArea.value += ']' + Forum_EraseNestedQuotes( v_trim( rgRawComment.text ) ) + ' [/quote]\n';


	elTextArea.focus();

	// resize the text area
	CommentThread.CheckTextAreaSize();

	ScrollToIfNotInView( elTextArea, 80, 40 );
}

var g_elAuthorMenu = null;
function Forum_AuthorMenu( elLink, event, bCanBan, gidTopic, gidComment, accountIDTarget, strTargetName )
{
	if ( !event )
		event = window.event;

	if ( !g_elAuthorMenu )
		g_elAuthorMenu = $('forum_user_menu');

	// reparent the author menu first, so we can make sure it's in the document
	var elParent = elLink.up('.commentthread_comment');
	if ( !elParent )
		elParent = elLink.up( '.forum_op' );

	if ( elParent )
		elParent.appendChild( g_elAuthorMenu.remove() );

	elParent.style.overflow = 'visible';


	// now set up the links
	var elProfileLink = $('forum_user_menu_viewprofile');
	var elViewPostsLink = $('forum_user_menu_viewposts');
	var elBanUserLink = $('forum_user_menu_ban');

	if ( g_rgForumTopics[ gidTopic ] )
	{
		var Topic = g_rgForumTopics[ gidTopic ];
		var rgForumData = Topic.m_rgForumData;

		elProfileLink.href = elLink.href;

		if ( rgForumData.is_public )
			elViewPostsLink.href = elProfileLink.href + '/posthistory/';
		else
			elViewPostsLink.href = Topic.GetSearchURL( { author: accountIDTarget } );

		if ( elBanUserLink )
		{
			if ( bCanBan )
			{
				elBanUserLink.href = 'javascript:Forum_BanUser( ' + rgForumData['owner'] + ', \'' + rgForumData['gidforum'] + '\', \'' + gidTopic + '\', \'' + gidComment + '\', ' + accountIDTarget + ' );'
				elBanUserLink.show();
			}
			else
			{
				elBanUserLink.hide();
			}
		}

		$('forum_user_menu_inner').style.minWidth = $(elLink).getWidth() + 'px';

		ShowMenu( elLink, g_elAuthorMenu, 'left', 'bottom', 2 );
	}

	return false;
}

function Forum_ShowForumAudits( gidForumTopic, gidObject )
{
	if ( g_rgForumTopics[ gidForumTopic ] )
	{
		g_rgForumTopics[ gidForumTopic ].ShowAudits( gidObject );
	}
}

function Forum_CloseTradingTopic( gidForumTopic )
{
	ShowConfirmDialog( 'Close this topic', 'Marking this topic as "Closed" will prevent any more replies or trade offers on it.  Once it is closed, you will not be able to take any more actions on it.', 'Close this topic')
	.done( function() {
		Forum_SetTopicFlag( gidForumTopic, 'locked', true );
	})
}


function ShowForumModalSuccess( strMessage, strDetails )
{
	$('forum_success_modal_message').update( strMessage );
	$('forum_success_modal_text').update( strDetails ? strDetails : '&nbsp;' );
	showContentAsModal( 'forum_modal', $('forum_success_modal_content' ) );
}

var g_fnForumConfirmAction;
function Forum_ConfirmAction( strMessage, strDetails, fnAction, strButtonText )
{
	$('forum_confirm_message').update( strMessage );
	$('forum_confirm_text').update( strDetails ? strDetails : '&nbsp;' );
	$('forum_confirm_button').update( strButtonText ? strButtonText : 'OK' );
	showContentAsModal( 'forum_modal', $('forum_confirm_modal_content' ) );
	g_fnForumConfirmAction = fnAction;
}

function Forum_OnConfirmActionOK()
{
	g_fnForumConfirmAction();
	hideModal( 'forum_modal' );
}

CForumTopic = Class.create( {

	m_rgForumData: null,
	m_strActionURL: null,
	m_gidForumTopic: null,
	m_rgRawData: null,	//raw text and author data, for editing/quoting

	m_bAJAXInFlight: false,

	// for editing
	m_elTextArea: null,
	m_oTextAreaSizer: null,

	initialize: function( rgForumData, url, gidTopic, rgRawData )
	{
		this.m_rgForumData = rgForumData;
		this.m_strActionURL = url;
		this.m_gidForumTopic = gidTopic;
		this.m_rgRawData = rgRawData;


		this.m_elTextArea = $( 'forum_topic_edit_' + gidTopic + '_textarea');

		if ( this.m_elTextArea )
		{
			this.m_oTextAreaSizer = new CAutoSizingTextArea( this.m_elTextArea, 40 );
		}

		// render audits out of the comment thread
		// we'll defer this to make sure the comment thread is initialized before it runs
		var fn = function( thisClosure ) {
			if ( g_rgForumTopicCommentThreads[ thisClosure.m_gidForumTopic ] )
				thisClosure.RenderCommentAudits( g_rgForumTopicCommentThreads[ thisClosure.m_gidForumTopic ].m_rgRawCommentCache );
		};
		fn.defer( this );

	},

	CheckTextAreaSize: function()
	{
		this.m_oTextAreaSizer.OnTextInput();
	},

	GetActionURL: function( action )
	{
		var url = this.m_strActionURL + action + '/';
		if ( this.m_rgForumData['feature'] )
			url += this.m_rgForumData['feature'] + '/';
		return url;
	},

	ParametersWithDefaults: function( params )
	{
		if ( !params )
			params = {};

		params['gidforumtopic'] = this.m_gidForumTopic;
		params['sessionid'] = g_sessionID;

		return params;
	},

	Edit: function( title, text )
	{
		if ( this.m_bAJAXInFlight )
			return;

		this.m_bAJAXInFlight = true;

		new Ajax.Request( this.GetActionURL( 'edittopic' ), {
			method: 'post',
			parameters: this.ParametersWithDefaults( { title: title, text: text } ),
			onSuccess: function() { window.location.reload() },
			onFailure: this.OnModeratorActionFailed.bind(this)
		});
	},

	Delete: function()
	{
		if ( this.m_bAJAXInFlight )
			return;

		this.m_bAJAXInFlight = true;

		new Ajax.Request( this.GetActionURL( 'deletetopic' ), {
			method: 'post',
			parameters: this.ParametersWithDefaults(),
			onSuccess: this.RedirectToTopicListPage.bind(this),
			onFailure: this.OnModeratorActionFailed.bind(this)
		} );
	},

	SetTopicFlag: function( flag, value )
	{
		if ( this.m_bAJAXInFlight )
			return;

		this.m_bAJAXInFlight = true;

		var fnOnSuccess = function() { window.location.reload(); };
		if ( flag == 'purge' )
			fnOnSuccess = this.RedirectToTopicListPage.bind(this);

		new Ajax.Request( this.GetActionURL( 'moderatetopic' ), {
			method: 'post',
			parameters: this.ParametersWithDefaults( { action: 'setflag', flag: flag, value: value } ),
			onSuccess: fnOnSuccess,
			onFailure: this.OnModeratorActionFailed.bind(this)
		});
	},

	ReportPost: function( author, gidcomment )
	{
		var form = $('forum_reportpost_form');

		// blank out the text area if the user is making a new report
		if ( form.elements['gidcomment'].value != gidcomment )
			form.elements['report_reason'].value = '';

		form.elements['author'].value = author;
		form.elements['gidcomment'].value = gidcomment;
		form.elements['gidtopic'].value = this.m_gidForumTopic;

		showContentAsModal( 'forum_modal', $('report_modal_content') );

		form.elements['report_reason'].focus();
	},

	SubmitReportPost: function()
	{
		var form = $('forum_reportpost_form');

		var author = form.elements['author'].value;
		var gidcomment = form.elements['gidcomment'].value;
		var report = form.elements['report_reason'].value;

		if ( report && report.length > 0 )
		{
			new Ajax.Request( this.GetActionURL( 'reportpost' ), {
				method: 'post',
				parameters: this.ParametersWithDefaults( { author: author, gidcomment: gidcomment, report: report } ),
				onSuccess: this.OnReportPostSuccess.bind(this),
				onFailure: this.OnModeratorActionFailed.bind(this)
			});
		}

		hideModal( 'forum_modal' );
		form.elements['report_reason'].value='';
	},

	OnReportPostSuccess: function()
	{
		ShowForumModalSuccess( 'Thank you for your report', 'Your report has been sent to the moderators for review.' );
	},

	MoveTopic: function()
	{
		Forum_MoveTopics( this.GetActionURL( 'movetopic' ), this.m_rgForumData, [ this.m_gidForumTopic ])
			.done( this.OnMoveTopicSuccess.bind(this) )
			.fail( this.OnModeratorActionFailed.bind(this) );

	},

	OnMoveTopicSuccess: function( transport )
	{
		var strNewURL = null;
		if ( transport && transport.responseJSON && transport.responseJSON.newtopic )
			strNewURL = transport.responseJSON.newtopic;

		$('forum_movetopic_results_back').observe( 'click', this.RedirectToTopicListPage.bind(this) );

		if ( strNewURL )
			$('forum_movetopic_results_topic').observe( 'click', function() { window.location = strNewURL; } );
		else
			$('forum_movetopic_results_topic').hide();

		showContentAsModal( 'forum_modal', $('forum_movetopic_results') );
	},

	RedirectToTopicListPage: function()
	{
		window.location = this.m_rgForumData['forum_url'];
	},

	OnModeratorActionFailed: function( transport )
	{
		this.m_bAJAXInFlight = false;
		ShowForumModalSuccess( 'Failed to modify the topic.  Please try again later.' );
	},

	RecordTopicViewed: function( timelastpost )
	{
		// fire and forget (success sets a cookie)
		new Ajax.Request( this.GetActionURL( 'recordtopicviewed' ), {
			method: 'post',
			parameters: this.ParametersWithDefaults( { timelastpost: timelastpost ? timelastpost + 1 : 0 } )
		});
	},

	Subscribe: function( fnExternalOnSuccess )
	{
		if ( g_rgForumTopicCommentThreads[ this.m_gidForumTopic ] )
		{
			var fnSuccess = function() {
				ShowForumModalSuccess(  'You\'ve been subscribed to this discussion.', 'You\'ll receive a comment notification whenever someone replies to this discussion.' );
				fnExternalOnSuccess();
			};
			var fnFail = ShowForumModalSuccess.bind( null, 'We\'re sorry, we were unable to subscribe to this discussion.  Please try again later.');
			g_rgForumTopicCommentThreads[ this.m_gidForumTopic ].Subscribe( fnSuccess, fnFail );
		}
	},

	Unsubscribe: function( fnExternalOnSuccess )
	{
		if ( g_rgForumTopicCommentThreads[ this.m_gidForumTopic ] )
		{
			var fnSuccess = function() {
				ShowForumModalSuccess(  'You\'ve been unsubscribed from this discussion.', 'You\'ll no longer receive comment notifications from this discussion.' );
				fnExternalOnSuccess();
			};
			var fnFail = ShowForumModalSuccess.bind( null, 'We\'re sorry, we were unable to unsubscribe from this discussion.  Please try again later.');
			g_rgForumTopicCommentThreads[ this.m_gidForumTopic ].Unsubscribe( fnSuccess, fnFail );
		}
	},

	ResolveReports: function()
	{
		if ( this.m_bAJAXInFlight )
			return;

		this.m_bAJAXInFlight = true;

		var Topic = this;
		new Ajax.Request( this.GetActionURL( 'moderatetopic' ), {
			method: 'post',
			parameters: this.ParametersWithDefaults( { action: 'resolvereports' } ),
			onSuccess: function(transport) {
				var cReportsResolved = transport.responseJSON.resolved_count || 0;
				var strMessage;
				if ( cReportsResolved > 0 )
					strMessage = 'All reports associated with this topic have been marked resolved.<br>Number of reports that had to be resolved: ' + cReportsResolved;
				else
					strMessage = 'All reports associated with this topic have already been marked as resolved.';

				ShowForumModalSuccess(  'Reports resolved.', strMessage );
				Topic.m_bAJAXInFlight = false;
			},
			onFailure: this.OnModeratorActionFailed.bind(this)
		});
	},

	RenderCommentAudits: function( rgCommentRawData )
	{
		var rgCommentAudits = this.m_rgForumData.comment_audits;
		if ( !rgCommentAudits || ( rgCommentAudits instanceof Array && rgCommentAudits.length == 0 ) )
			return;

		for ( gidComment in rgCommentRawData )
		{
			if ( rgCommentAudits[ gidComment ] )
			{
				var rgAudit = rgCommentAudits[gidComment];
				var elComment = $('comment_content_' + gidComment );
				if ( rgAudit['edit'] )
				{
					elComment.insert( {after: rgAudit['edit'] } );
				}
				if ( rgAudit['delete'] )
				{
					var elDeletedComment = $('deleted_comment_' + gidComment );
					if ( elDeletedComment )
					{
						elDeletedComment.down('span.commentthread_deleted_comment_audit').update( rgAudit['delete'] );
					}
				}
			}
		}
	},

	ShowAudits: function ( gidObject )
	{
		var strURL = this.GetActionURL( 'auditlog' );
		var rgParams = { gidforumtopic: this.m_gidForumTopic, gidobject: gidObject };

		window.open( strURL + '?' + Object.toQueryString( rgParams ), 'auditlog', 'height=540,width=640,resize=yes,scrollbars=yes');
	},

	GetSearchURL: function( rgSearchParams )
	{
		var strBaseURL = this.m_rgForumData['forum_search_url'];
		if ( this.m_rgForumData['type'] == 'Workshop' )
			rgSearchParams['appid'] = this.m_rgForumData['appid'];

		return strBaseURL + '?' + Object.toQueryString( rgSearchParams );
	}

} );

CCommentThreadForumTopic = Class.create( CCommentThread, {

	m_iInitialPage: 0,

	initialize: function( $super, type, name, rgCommentData, url, quoteBoxHeight )
	{
		$super( type, name, rgCommentData, url, quoteBoxHeight );

		this.m_iInitialPage = this.m_iCurrentPage;

		// watch for incoming # urls
		BindOnHashChange( this.OnLocationChange.bind( this ) );
		this.OnLocationChange( window.location.hash );

		if ( this.m_rgCommentData && this.m_rgCommentData.lastvisit )
		{
			var rgNewComments = $$('.commentthread_newcomment');
			if ( rgNewComments.length > 0 )
			{
				ScrollToIfNotInView( rgNewComments[0], 5000, 36 );
			}
		}

		RegisterForumTopicCommentThread( this.m_rgCommentData['feature2'], this );
	},

	OnLocationChange: function( hash )
	{
		if ( hash.match( /^#c[0-9]+$/ ) )
		{
			var gidComment = hash.substring(2);
			if ( !$( 'comment_' + gidComment ) )
				this.GoToPageWithComment( gidComment );
			else
				this.UpdatePermLinkHighlight();
		}
		else if ( hash.match( /^#p[0-9]+$/ ) )
		{
			var iPage = parseInt( hash.substring(2) ) - 1;
			if ( this.m_iCurrentPage != iPage )
				this.GoToPage( iPage );
		}
		else if ( !hash )
		{
			// reset to initial view
			this.GoToPage( this.m_iInitialPage );
			this.UpdatePermLinkHighlight();
		}
	},

	UpdatePermLinkHighlight: function()
	{
		var elContainer = $('commentthread_' + this.m_strName + '_posts' );
		elContainer.childElements().invoke( 'removeClassName', 'permlinked' );

		var hash = window.location.hash;
		if ( hash && hash.length > 2 && hash.match( /#c[0-9]+/ ) )
		{
			var elComment = $('comment_' + hash.substring( 2 ));
			var elDeletedComment = $('deleted_comment_' + hash.substring( 2 ));
			if ( elComment )
			{
				if ( elDeletedComment )
				{
					elDeletedComment.hide();
					elComment.show();
				}
				elComment.addClassName( 'permlinked' );
				ScrollToIfNotInView.defer( elComment, 5000, 36 );
			}
		}
	},

	/* override to get rid of animation */
	DoTransitionToNewPosts: function( response, eRenderReason )
	{
		var strNewHTML = response.comments_html;

		var elPosts = $('commentthread_' + this.m_strName + '_posts' );
		var elContainer = $('commentthread_' + this.m_strName + '_postcontainer' );
		var elArea = $('commentthread_' + this.m_strName + '_area' );

		var topic = g_rgForumTopics[ this.m_rgCommentData['feature2'] ];

		var bNewPost = ( eRenderReason == CCommentThread.RENDER_NEWPOST );

		// new posts get an animation, anything else just gets snapped in
		elContainer.style.height = elContainer.getHeight() + 'px';

		elPosts.update( strNewHTML );

		if ( topic )
		{
			topic.RenderCommentAudits( this.m_rgRawCommentCache );
		}

		if ( eRenderReason == CCommentThread.RENDER_GOTOPAGE || eRenderReason == CCommentThread.RENDER_NEWPOST )
		{
			if ( this.m_iCurrentPage != this.m_iInitialPage || window.location.hash.length > 1)
				window.location.hash = 'p' + ( this.m_iCurrentPage + 1);
		}
		else
			this.UpdatePermLinkHighlight();

		if ( bNewPost )
		{
			if ( elContainer.effect )
				elContainer.effect.cancel();

			window.setTimeout( function() {
				elContainer.effect = new Effect.Morph( elContainer, { style: 'height: ' + elPosts.getHeight() + 'px', duration: 0.25, afterFinish: function() { elPosts.style.position = 'static'; elContainer.style.height = 'auto';  } } );
			}, 10 );
		}
		else
		{
			elContainer.style.height = '';
			if ( eRenderReason != CCommentThread.RENDER_GOTOPOST && eRenderReason != CCommentThread.RENDER_DELETEDPOST )
				ScrollToIfNotInView.defer( elArea, 80 );
		}

		if ( this.m_iCurrentPage == this.m_cMaxPages - 1 )
		{
			if ( topic )
				topic.RecordTopicViewed( response.timelastpost );
		}

	},


	DeleteComment: function( $super, gidComment, bUndelete )
	{
		var fnOnConfirm = $super.bind( this, gidComment, bUndelete );
		if ( !bUndelete )
		{
			Forum_ConfirmAction(
				'Are you sure you want to delete this post?',
				'',
				fnOnConfirm,
				'Delete'
			);
		}
		else
		{
			// no confirmation for undeleting
			fnOnConfirm();
		}
	}

});

function Forum_RecordPotentialMergeTarget( rgForumData, gidTopic, strTitle )
{
	var rgTargets = _Forum_GetPotentialMergeTargets();
	for ( var i=0; i < rgTargets.length; i++ )
	{
		if ( rgTargets[i].gidTopic == gidTopic )
		{
			rgTargets.splice( i, 1 );
			break;
		}
	}
	rgTargets.unshift( { unClanIDOwner: rgForumData.owner, gidForum: rgForumData.gidforum, gidTopic: gidTopic, strTitle: strTitle } );
	_Forum_UpdatePotentialMergeTargets( rgTargets );
}

function _Forum_GetPotentialMergeTargets()
{
	var strForumMergeTargets = GetValueLocalStorage( 'rgForumMergeTargets', '[]' );
	var rgForumMergeTargets = V_ParseJSON( strForumMergeTargets );
	if ( !rgForumMergeTargets || !rgForumMergeTargets.length )
		rgForumMergeTargets = [];

	return rgForumMergeTargets;
}

function _Forum_UpdatePotentialMergeTargets( rgTargets )
{
	rgTargets.splice( 10 );	//max we will track
	SetValueLocalStorage( 'rgForumMergeTargets', V_ToJSON( rgTargets ) );
}

var g_rgRedirectTimeOptions = [
	{value: 0, label: 'No redirect' },
	{value: 1, label: '1 hour' },
	{value: 24, label: '1 day' },
	{value: 168, label: '1 week' },
	{value: 720, label: '1 month' },
	{value: -1, label: 'Permanent' }
];
function Forum_MergeTopicDialog( strActionURL, rgForumData, rgForumTopics, bResolveReports )
{
	var $DialogContent = $J('<div/>', {'class': 'merge_topic_dialog'} );
	var $MergeForm = $J('<form/>' );
	$DialogContent.append( $MergeForm );

	var strMessage = 'Merging topics will move all the posts from one or more topics into another topic.  If there are already posts in the target topic, the new posts will be interleaved by time posted.  This cannot be undone.<br><br>';
	strMessage += rgForumTopics.length > 1 ? 'Select a recently viewed topic to merge the selected topics into:' : 'Select a recently viewed topic to merge this topic into:';

	$MergeForm.append( $J('<div/>', {'class': 'merge_topic_dialog_content' }).html( strMessage ) );

	var $List = $J('<div/>', {'class': 'merge_topic_target_list' } );
	$MergeForm.append( $List );

	var strMoreInstructions = 'If the topic you\'d like to merge to isn\'t listed here, you can <%1$s>browse for the topic you want<%2$s> in a new window.  This list will be automatically updated when you return.'.replace( /%1\$s/, 'a class="whiteLink" href="' + rgForumData.forum_url + '" target="_blank"').replace( /%2\$s/, '/a' );
	$MergeForm.append( $J('<div/>', {'class': 'merge_topic_dialog_content' }).html( strMoreInstructions ) );

	// redirect section
	var $Expiry = $J('<div/>', {'class': 'merge_topic_dialog_content' });
	var $Select = $J('<select/>', {name: 'redirect_expiry_hours', style: 'width: 240px;' } );
	for ( var i = 0; i < g_rgRedirectTimeOptions.length; i++ )
	{
		var rgOpt = g_rgRedirectTimeOptions[i];
		$Select.append( $J('<option/>', {value: rgOpt.value }).text( rgOpt.label) );
	}
	Forum_InitExpiryOptions( $Select );
	$Expiry.append( 'Leave redirect for: ', $Select );
	$MergeForm.append( $Expiry );

	// merge target list
	var fnMakeMergeOption = function( unClanIDOwner, gidForum, gidTopic, strLabel ) {
		var $Item = $J('<div/>', {'class': 'ellipsis'} );
		var id = 'merge_target_' + gidTopic;
		// use html5 data, jquery data disappears when the modal is dismissed
		var $Radio = $J('<input/>', {type: 'radio', name: 'merge_target', value: gidTopic, id: id,
			'data-unclanidowner': unClanIDOwner, 'data-gidforum': gidForum } );
		var $Label = $J('<label/>', {'for': id }).text( strLabel );
		$Item.append( $Radio, $Label );
		return $Item;
	}

	var oSelectedTopics = {};
	for( var i = 0; i< rgForumTopics.length; i++ )
		oSelectedTopics[rgForumTopics[i]] = true;

	var fnPopulateMergeOptions = function() {
		var cTopicsToShow = 5;
		$List.html('');
		if ( rgForumTopics.length > 1 )
		{
			var $MergeTogether = fnMakeMergeOption( 0, 0, 0, 'Merge the selected topics together into the oldest topic' );
			$MergeTogether.addClass( 'merge_topic_together_option');
			$List.append( $MergeTogether );
			$MergeTogether.children( 'input').prop( 'checked', true );
			cTopicsToShow--;
		}
		var rgMergeTargets = _Forum_GetPotentialMergeTargets();
		for ( var i = 0; i < rgMergeTargets.length; i++ )
		{
			var rgTarget = rgMergeTargets[i];
			// skip it if it's one of the ones we're merging
			if ( oSelectedTopics[ rgTarget.gidTopic] )
				continue;

			$List.append( fnMakeMergeOption( rgTarget.unClanIDOwner, rgTarget.gidForum, rgTarget.gidTopic, rgTarget.strTitle ) );

			if ( --cTopicsToShow == 0 )
				break;
		}
	}
	fnPopulateMergeOptions();

	var strInitialMergeTargetsJSON = GetValueLocalStorage( 'rgForumMergeTargets', '[]' );
	var nTimeoutCheckMergeTargets = window.setInterval( function() {
		var strMergeTargetsJSON = GetValueLocalStorage( 'rgForumMergeTargets', '[]' );
		if ( strMergeTargetsJSON != strInitialMergeTargetsJSON )
		{
			var strSelectedOption = $List.find( 'input:checked').val();
			fnPopulateMergeOptions();
			strInitialMergeTargetsJSON = strMergeTargetsJSON;

			// restore whatever they had selected before we reloaded (if it's still there )
			if ( typeof strSelectedOption != 'undefined' )
				$List.find( 'input[value="' + strSelectedOption + '"]').prop( 'checked', true );
		}
	}, 200 );


	var deferred = $J.Deferred();

	var Modal = ShowConfirmDialog( 'Merge Topics', $DialogContent, 'Merge Topics' );
	//Modal.fail( function() { Deferred.reject(); } );
	Modal.done( function() {
		var params = {};
		params['sessionid'] = g_sessionID;
		params['gidforumtopic_list'] = V_ToJSON( rgForumTopics );
		params['source_forum_name'] = rgForumData.forum_display_name;
		params['redirect_expiry_hours'] = $Select.val();
		if ( bResolveReports )
			params['resolve_reports'] = 1;

		var $SelectedTarget = $List.find( 'input:checked' );
		if ( !$SelectedTarget.length )
			return;

		// not having a value implies our "merge together" option
		if ( $SelectedTarget.val() )
		{
			params['destination_clanidowner'] = $SelectedTarget.data( 'unclanidowner' );
			params['destination_gidforum'] = $SelectedTarget.data( 'gidforum' );
			params['destination_gidtopic'] = $SelectedTarget.val();
		}

		new Ajax.Request( strActionURL, {
			method: 'post',
			parameters: params,
			onSuccess: deferred.resolve.bind( deferred ),
			onFailure: deferred.reject.bind( deferred )
		});
	}).always( function() {
		window.clearInterval( nTimeoutCheckMergeTargets );
	});

	return deferred;
}

function Forum_MoveTopics( strActionURL, rgForumData, rgForumTopics, bResolveReports )
{
	var form = $('forum_movetopic_form');

	// blank out the text area if the user is making a new report
	form.elements['gidforumtopic_list'].value = V_ToJSON( rgForumTopics );
	form.elements['source_forum_name'].value = rgForumData.forum_display_name;
	Forum_InitExpiryOptions( $J( form.elements['redirect_expiry_hours'] ) );

	var deferred = new jQuery.Deferred();

	Forum_SetMoveTopicClan( rgForumData['owner'], null );

	if ( $('associate_game' ) && $('game_select_suggestions_ctn') && $('game_select_suggestions') && !$('associate_game').m_bInitialized )
	{
		var elAssociateGame = $('associate_game');
		elAssociateGame.m_bInitialized = true;
		new CGameSelector( $('associate_game'), $('game_select_suggestions_ctn'), $('game_select_suggestions'), Forum_OnMoveTopicSelectGame );
	}


	var fnSubmitMoveTopic = function() {
		var params = form.serialize( true );
		params['sessionid'] = g_sessionID;
		if ( bResolveReports )
			params['resolve_reports'] = 1;

		var elSelect = form.elements['destination_gidforum'];

		new Ajax.Request( strActionURL, {
			method: 'post',
			parameters: params,
			onSuccess: deferred.resolve.bind( deferred ),
			onFailure: deferred.reject.bind( deferred )
		});
	};

	if ( !$('submit_move_topic_button').m_bBound )
	{
		$('submit_move_topic_button').observe( 'click', fnSubmitMoveTopic );
		$('submit_move_topic_button').m_bBound = true;
	}

	if ( $('forum_movetopic_globaldestinations') && !$('forum_movetopic_globaldestinations').m_bBound )
	{
		$('forum_movetopic_globaldestinations').observe( 'click', Forum_SetMoveTopicClan.bind( null, false, 753 ) );
		$('forum_movetopic_globaldestinations').m_bBound = true;
	}

	showContentAsModal( 'forum_modal', $('forum_movetopic_modal_content') );

	return deferred;
}


function Forum_SetMoveTopicClan( clanidowner, appidowner )
{
	var form = $('forum_movetopic_form');
	var rgReloadParams = null;
	if ( clanidowner )
	{
		if ( form.elements['destination_clanidowner'].value != clanidowner )
		{
			form.elements['destination_clanidowner'].value = clanidowner;
			form.elements['destination_appidowner'].value = '';
			rgReloadParams = { destination_clanid: clanidowner };
		}
	}
	else if ( appidowner )
	{
		if ( form.elements['destination_appidowner'].value != appidowner )
		{
			form.elements['destination_clanidowner'].value = '';
			form.elements['destination_appidowner'].value = appidowner;
			rgReloadParams = { destination_appid: appidowner };
		}
	}

	if ( rgReloadParams )
	{
		$(form.elements['destination_gidforum']).hide();
		$('forum_movetopic_destination_throbber').show();
		$('forum_movetopic_destinationclan') && $('forum_movetopic_destinationclan').update('&nbsp;');
		$('forum_movetopic_destination_unavailable').hide();
		rgReloadParams['sessionid'] = g_sessionID;

		new Ajax.Request( 'http://steamcommunity.com/forum/0/General/gettopicdestinations/', {
			method: 'get',
			parameters: rgReloadParams,
			onSuccess: Forum_OnMoveTopicDestinations.bind( null, clanidowner, appidowner ),
			onFailure: Forum_OnMoveTopicDestinationsFailed.bind( null, clanidowner, appidowner )
		} );
	}
}

function Forum_OnMoveTopicSelectGame( GameSelector, rgAppData )
{
	$('associate_game').value='';

	Forum_SetMoveTopicClan( false, rgAppData.appid );
}

function Forum_OnMoveTopicDestinations( clanidowner, appidowner, transport )
{
	var form = $('forum_movetopic_form');
	if ( ( !clanidowner || form.elements['destination_clanidowner'].value == clanidowner ) &&
		( !appidowner || form.elements['destination_appidowner'].value == appidowner ) )
	{
		$('forum_movetopic_destination_throbber').hide();
		var $Select = $J(form.elements['destination_gidforum']);
		$Select.html('');
		var rgForums = transport.responseJSON.rgForums;
		if ( rgForums && rgForums.length > 0 )
		{
			for ( var i = 0; i < rgForums.length; i++ )
			{
				var rgForum = rgForums[i];
				var $Option = $J( '<option/>', { value: rgForum.gidforum } );
				$Option.text( rgForum.name );
				$Select.append( $Option );
			}
		}
		else
		{
			Forum_OnMoveTopicDestinationsFailed( clanidowner, appidowner, transport );
			return;
		}

		var elName = $('forum_movetopic_destinationclan');
		if ( elName )
			elName.update( transport.responseJSON.strName );

		$Select.show();
		$Select.focus();
		$('submit_move_topic_button').show();
	}
}

function Forum_OnMoveTopicDestinationsFailed( clanidowner, appidowner, transport )
{
	var form = $('forum_movetopic_form');
	if ( ( !clanidowner || form.elements['destination_clanidowner'].value == clanidowner ) &&
		( !appidowner || form.elements['destination_appidowner'].value == appidowner ) )
	{
		$('forum_movetopic_destination_throbber').hide();
		$(form.elements['destination_gidforum']).hide();
		$('forum_movetopic_destination_unavailable').show();
		$('submit_move_topic_button').hide();
	}
}

function V_CountKeys( obj )
{
	if ( Object.keys )
		return Object.keys(obj).length;
	else
	{
		var c = 0;
		for ( var x in obj )
			c++;
		return c;
	}
}

function V_Keys( obj )
{
	if ( Object.keys )
		return Object.keys( obj );
	else
	{
		var rgResults = [];
		for ( var x in obj )
			rgResults.push( x );
		return rgResults;
	}
}

function InitializeForumBulkActions( strName )
{
	var $ForumArea = $J('#forum_' + strName + '_area' );
	var $ForumActions = $J('#forum_' + strName + '_bulk_actions' );
	var $BtnEnable = $J('#forum_' + strName + '_bulk_enable');
	var $BtnDisable = $J('#forum_' + strName + '_bulk_disable');

	var $BtnDelete = $J('#forum_' + strName + '_bulk_delete');
	var $BtnUnDelete = $J('#forum_' + strName + '_bulk_undelete');

	var $BtnLock = $J('#forum_' + strName + '_bulk_lock');
	var $BtnUnLock = $J('#forum_' + strName + '_bulk_unlock');

	var $BtnMove = $J('#forum_' + strName + '_bulk_move');
	var $BtnMerge = $J('#forum_' + strName + '_bulk_merge');

	var $BtnPurge = $J('#forum_' + strName + '_bulk_purge');

	var $OtherPagesWarning = $J('#forum_' + strName + '_bulk_otherpages').hide();
	var $OtherPagesCount = $J('#forum_' + strName + '_bulk_otherpage_count');
	var $OtherPagesClear = $J('#forum_' + strName + '_bulk_otherpage_clear');

	if ( !$ForumActions.length )
		return;

	var bEnabled = false;
	var rgAllSelectedTopics = {};
	var cTopicsCheckedOnOtherPages = 0;

	var $BtnShowDefault = $J().add( $BtnDelete ).add( $BtnLock ).add( $BtnMove ).add( $BtnMerge );
	var $BtnHideDefault = $J().add( $BtnUnDelete ).add( $BtnUnLock ).add( $BtnPurge );

	var fnShowControlsIfCheckboxChecked = function ()
	{
		var $CheckedBoxes = $ForumArea.find( '.forum_topic_checkbox_input:checked' );

		$BtnShowDefault.show();
		$BtnHideDefault.hide();

		if ( cTopicsCheckedOnOtherPages > 0 )
		{
			$OtherPagesWarning.show();
			$OtherPagesCount.text( cTopicsCheckedOnOtherPages );
			if ( cTopicsCheckedOnOtherPages == 1 )
			{
				$OtherPagesWarning.children( '.bulk_otherpages_single' ).show();
				$OtherPagesWarning.children( '.bulk_otherpages_multi' ).hide();
			}
			else
			{
				$OtherPagesWarning.children( '.bulk_otherpages_single' ).hide();
				$OtherPagesWarning.children( '.bulk_otherpages_multi' ).show();
			}
		}
		else
		{
			$OtherPagesWarning.hide();
		}

		if ( $CheckedBoxes.length > 0 || cTopicsCheckedOnOtherPages )
		{
			var $CheckedTopics = $CheckedBoxes.parents( '.forum_topic' );
			var cTotalTopics = 0;
			var cDeletedTopics = 0;//$CheckedTopics.filter( '.deleted' ).length;
			var cLockedTopics = 0;//$CheckedTopics.filter( '.locked' ).length;
			var cMovedTopics = 0;

			for ( var gidTopic in rgAllSelectedTopics )
			{
				cTotalTopics++;
				if ( rgAllSelectedTopics[gidTopic].deleted )
					cDeletedTopics++;
				if ( rgAllSelectedTopics[gidTopic].locked )
					cLockedTopics++;
				if ( rgAllSelectedTopics[gidTopic].moved )
					cMovedTopics++;
			}

			if ( cMovedTopics )
			{
				// you can only purge moved topics - remove all other commands
				$BtnShowDefault.hide();
				$BtnPurge.show();
			}
			else
			{

				if ( cDeletedTopics == cTotalTopics )
				{
					$BtnUnDelete.show();
					$BtnDelete.hide();
				}

				if ( cDeletedTopics > 0 )
				{
					// really only undelete will work on deleted topics
					$BtnMove.hide();
					$BtnMerge.hide();
					$BtnLock.hide();
					$BtnPurge.show();
				}
				else if ( cLockedTopics == cTotalTopics )
				{
					$BtnUnLock.show();
					$BtnLock.hide();
				}
			}

			$ForumActions.find('.manage_actions_buttons').fadeTo( 'fast', 1.0 );
		}
		else
		{
			$ForumActions.find('.manage_actions_buttons').fadeTo( 'fast', 0.3 );
		}
	}

	var fnAddCheckboxes = function() {

		if ( !bEnabled )
			return;

		// only include moved threads if the user can purge.  purging is the only thing you can do with a moved topic.
		var $ForumTopics = $ForumArea.find( $BtnPurge.length ? '.forum_topic' : '.forum_topic:not(.moved)' );
		cTopicsCheckedOnOtherPages = V_CountKeys( rgAllSelectedTopics );

		$ForumTopics.each( function() {
			var $ForumTopic = $J(this);

			var gidForumTopic = this.getAttribute( 'data-gidforumtopic' );
			if ( rgAllSelectedTopics[gidForumTopic] )
				cTopicsCheckedOnOtherPages--;

			if ( !$ForumTopic.hasClass( 'bulk_edit_mode' ) )
			{
				var $Checkbox = $J('<input/>', {'type': 'checkbox', 'class': 'forum_topic_checkbox_input' } );
				$Checkbox.data( 'gidForumTopic', gidForumTopic );

				$Checkbox.change( function() {
					if ( $Checkbox.prop('checked') )
					{
						$ForumTopic.addClass( 'selected_for_bulk' );
						rgAllSelectedTopics[gidForumTopic] = {
							deleted: $ForumTopic.hasClass( 'deleted' ),
							locked: $ForumTopic.hasClass( 'locked' ),
							moved: $ForumTopic.hasClass( 'moved' ),
						};
					}
					else
					{
						$ForumTopic.removeClass( 'selected_for_bulk' );
						delete rgAllSelectedTopics[gidForumTopic];
					}
					fnShowControlsIfCheckboxChecked();
				} );

				// restore the checked state
				if ( rgAllSelectedTopics[gidForumTopic] )
				{
					$Checkbox.prop( 'checked', true );
					$Checkbox.change();
				}

				var $Wrapper = $J('<div/>', {'class': 'forum_topic_checkbox' } );
				$Wrapper.html( '&nbsp;' );
				$Wrapper.prepend( $Checkbox );

				$ForumTopic.find( 'a.forum_topic_overlay').on( 'click', function( event ) {
					// only on left click, otherwise we let middle clicks open in tabs, etc
					if ( typeof event.originalEvent.button == 'undefined' || event.originalEvent.button == 0 )
					{
						$Checkbox.prop( 'checked', function( i, val ) { return !val; } );
						$Checkbox.change();
						event.preventDefault();
					}
				} );

				$ForumTopic.prepend( $Wrapper );
				$ForumTopic.addClass( 'bulk_edit_mode' );

			}
		});

		fnShowControlsIfCheckboxChecked();
	};

	var fnClearAllSelections = function() {
		rgAllSelectedTopics = {};
		cTopicsCheckedOnOtherPages = 0;
		$ForumArea.find( '.forum_topic_checkbox_input:checked').each( function() {
			$J(this).prop( 'checked', false ).change();
		} );
		fnShowControlsIfCheckboxChecked();
	};

	$OtherPagesClear.click( fnClearAllSelections );


	$BtnEnable.click( function() {
		bEnabled = true;
		$ForumActions.slideDown( 'fast' );
		fnAddCheckboxes();

		$BtnEnable.hide();
		$BtnDisable.show();
	});
	$BtnDisable.click( function() {
		bEnabled = false;
		$ForumActions.slideUp( 'fast' );
		$ForumArea.find( '.forum_topic').removeClass('selected_for_bulk').removeClass( 'bulk_edit_mode');
		$ForumArea.find( '.forum_topic').children( '.forum_topic_checkbox').detach();
		$ForumArea.find( '.forum_topic a.forum_topic_overlay').off( 'click' );

		$BtnEnable.show();
		$BtnDisable.hide();
	});

	$BtnDelete.click( function() { ForumBulkDelete( strName, V_Keys( rgAllSelectedTopics ) ); } );
	$BtnUnDelete.click( function() { ForumBulkDelete( strName, V_Keys( rgAllSelectedTopics ), true ); } );

	$BtnLock.click( function() { ForumBulkLock( strName, V_Keys( rgAllSelectedTopics ) ); } );
	$BtnUnLock.click( function() { ForumBulkLock( strName, V_Keys( rgAllSelectedTopics ), true ); } );

	$BtnMove.click( function() { ForumBulkMove( strName, V_Keys( rgAllSelectedTopics ) ).done( fnClearAllSelections ); } );
	$BtnMerge.click( function() { ForumBulkMerge( strName, V_Keys( rgAllSelectedTopics ) ).done( fnClearAllSelections ); } );

	$BtnPurge.click( function() { ForumBulkPurge( strName, V_Keys( rgAllSelectedTopics ), fnClearAllSelections ); } );

	//prototype AJAX
	Ajax.Responders.register( { onComplete: fnAddCheckboxes } );
}

function ForumBulkDelete( strName, rgForumTopicGIDs, bUndelete )
{
	BulkModerate( strName, rgForumTopicGIDs, 'deleted', !bUndelete)
		.done( function( data ) {
			if ( bUndelete )
				ShowAlertDialog( 'Undelete', 'The selected topics have been restored.' );
			else
				ShowAlertDialog( 'Delete', 'The selected topics have been deleted.' );
		});
}

function ForumBulkLock( strName, rgForumTopicGIDs, bUnlock )
{
	BulkModerate( strName, rgForumTopicGIDs, 'locked', !bUnlock)
		.done( function( data ) {
			if ( bUnlock )
				ShowAlertDialog( 'Unlock', 'The selected topics have been unlocked.' );
			else
				ShowAlertDialog( 'Lock', 'The selected topics have been locked.' );
		});
}

function ForumBulkMove( strName, rgForumTopicGIDs )
{
	return BulkModerate( strName, rgForumTopicGIDs, 'movetopic' )
		.done( function( transport ) {
			// the transport is from prototype
			ShowAlertDialog( 'Move...', 'The selected topics have been moved to the new forum.' );
		});
}

function ForumBulkMerge( strName, rgForumTopicGIDs )
{
	return BulkModerate( strName, rgForumTopicGIDs, 'mergetopics' )
		.done( function( transport ) {
			// the transport is from prototype
			var strNewURL = '';
			if ( transport && transport.responseJSON && transport.responseJSON.newtopic )
				strNewURL = transport.responseJSON.newtopic;

			if ( strNewURL )
			{
				ShowConfirmDialog(
					'Merge Topics',
					'The selected topics have been merged into a single topic.',
					'Go to the merged topic',
					'OK'
				).done( function() {
						window.location = strNewURL;
					});
			}
			else
			{
				// don't have a URL?
				ShowAlertDialog('Merge Topics',
					'The selected topics have been merged into a single topic.' );
			}
		} );
}

function ForumBulkPurge( strName, rgForumTopicGIDs, fnOnComplete )
{
	ShowConfirmDialog('Permanently Delete ',
		'Are you sure you want to permanently delete this topic?  This cannot be undone.',
		'Permanently Delete'
	).done ( function() {
		BulkModerate( strName, rgForumTopicGIDs, 'purge', true )
		.done( function( data ) {
			ShowAlertDialog( 'Permanently Delete', 'The selected topics have been permanently deleted.' );
			fnOnComplete();
		});
	});
}


function BulkModerate( strName, rgForumTopicGIDs, flag, value )
{
	var Forum = g_rgForums[strName];
	var $ForumArea = $J('#forum_' + strName + '_area' );

	if ( rgForumTopicGIDs.length == 0 )
	{
		return $J.Deferred();
	}
	var bResolveReports = $J('#forum_' + strName + '_bulk_resolve_reports').prop('checked');

	if ( flag == 'movetopic' )
	{
		deferred = Forum_MoveTopics( Forum.GetActionURL( 'movetopic' ), Forum.m_rgForumData, rgForumTopicGIDs, bResolveReports );
		deferred.always( function() { hideModal( 'forum_modal' ); } );	//hide the old crufty modal
	}
	else if ( flag == 'mergetopics' )
	{
		deferred = Forum_MergeTopicDialog( Forum.GetActionURL( 'mergetopics' ), Forum.m_rgForumData, rgForumTopicGIDs, bResolveReports );
	}
	else
	{
		var strURL = Forum.GetActionURL( 'moderatetopic' );
		var rgParams = {
			sessionid: g_sessionID,
			action: 'setflag',
			flag: flag,
			value: value,
			gidforumtopic_list: V_ToJSON( rgForumTopicGIDs ),
			resolve_reports: (bResolveReports ? '1' : '')
		}
		var deferred =  $J.ajax( strURL, {
			data: rgParams,
			type: 'POST'
		});
	}

	return deferred.fail( function() {
		ShowAlertDialog( 'Error', 'There was an error while proccessing all or part of your request.  Please verify that you got the expected results.' );
	}).always( function() {
		Forum.ReloadCurrentPage();
	});
}


function StartTradeOfferForTradingTopic( unAccountID, unClanIDOwner, gidTopic )
{
	var params = {};
	params['partner'] = unAccountID;
	params['forum_owner'] = unClanIDOwner;
	params['forum_topic'] = gidTopic;
	ShowTradeOffer( 'new', params );
}

function Forum_InitExpiryOptions( $Select )
{
	var nLastExpiryChoice = GetValueLocalStorage( 'nForumLastExpiryChoice', 0 );
	$Select.val( nLastExpiryChoice );

	$Select.off( 'change.ForumRememberChoice' );
	$Select.on( 'change.ForumRememberChoice', function() {
		SetValueLocalStorage( 'nForumLastExpiryChoice', $Select.val() );
	});
}

function Forum_InitBanLengthOptions( $Select )
{
	var nLastBanLengthChoice = GetValueLocalStorage( 'nForumLastBanLengthChoice', 0 );
	$Select.val( nLastBanLengthChoice );

	$Select.off( 'change.ForumRememberChoice' );
	$Select.on( 'change.ForumRememberChoice', function() {
		SetValueLocalStorage( 'nForumLastBanLengthChoice', $Select.val() );
	});
}


function Forum_BanUser( clanid, gidForum, gidTopic, gidComment, accountIDTarget )
{
	var $WaitElem = $J('<div/>', {'class': 'forum_banuser_modal_wait'}).append( '<img src="http://cdn.steamcommunity.com/public/images/login/throbber.gif">' );
	var Modal = ShowConfirmDialog( 'Ban User', $WaitElem, 'Ban User' );

	Modal.GetContent().find('.newmodal_buttons').css( 'visibility', 'hidden' );

	$J.get( 'http://steamcommunity.com/gid/' + clanid + '/banuserdialog', {
		ajax: 1,
		gidforum: gidForum,
		gidtopic: gidTopic,
		gidcomment: gidComment,
		target: accountIDTarget
	}).done( function( data ) {
		Modal.GetContent().find('.newmodal_buttons').css( 'visibility', '' );
		var $Content = $J(data);
		$WaitElem.replaceWith( $Content );
		Modal.AdjustSizing();

		var $Form = $Content.find( 'form#forum_banuser_form' );
		Forum_InitBanLengthOptions( $Form.find('select[name=ban_length]') );

		Modal.done( function() {
			var bDelete = $Form[0].elements.deletecomments && $Form[0].elements.deletecomments.checked;
			var bKick = $Form[0].elements.kickmember && $Form[0].elements.kickmember.checked;

			if ( $Form[0].elements.ban_length.value < 0 && !bDelete && !bKick )
			{
				ShowAlertDialog( 'Ban User', 'At least one option must be selected.  The user has not been banned.' );
			}
			else
			{
				$J.post(
					'http://steamcommunity.com/gid/' + clanid + '/banuser/?ajax=1', $Form.serialize()
				).done( function( data ) {
					ShowAlertDialog( 'Ban User', data.message ? data.message : 'The user\'s posting and editing privileges have been revoked.' );
				}).fail( function() {
					ShowAlertDialog( 'Ban User', 'You may not have permission to ban users.  Please verify your account\'s permissions or try again later.' );
				});
			}
		});

	}).fail( function() {
		Modal.Dismiss();
		ShowAlertDialog( 'Ban User', 'You may not have permission to ban users.  Please verify your account\'s permissions or try again later.' );
	})
}

