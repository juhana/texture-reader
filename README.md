This is a standalone reader for [Texture](https://texturewriter.com) stories.

# Installation

## Method 1

This method is simpler in the sense that you don't need to modify the story file
you get from the Texture Writer. Choose this method if you plan on uploading the
final product on the Internet.

1. Download all the files in this repository (green "clone or download" button).

2. Download the Texture story data from your 
[texturewriter.com](https://texturewriter.com) project: open the Settings page
and click on the "Download backup file" button. You'll get the data in JSON format in
a file with a .texture ending.
 
3. Put the Texture data file in the same directory where you downloaded this
repository. We'll assume it's called "story.json" from now on (it can have any
other name too.)

4. Edit index.html and add this to the end of the file:
    ``` 
    <script>
      texture.load( "story.json" );
    </script>
    ``` 

Now the story should be playable by uploading the whole directory to the 
Internet (or a local server) and opening the index.html from there.


Notes and caveats:
 * You can also load the story data from anywhere on the Internet 
   (`texture.load("http://example.com/story.json")`), but if you do, you'll need 
   CORS headers enabled in the target server if the file is in another domain 
   (https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
 * `texture.load()` will not work on local filesystem, it needs to be online,
   in a local server (localhost) or in some other system where this security 
   restriction doesn't exist (apps etc.) Therefore if you plan on sharing the 
   story by sending the whole thing to people to play on their own computers, 
   use method 2 described below instead.  


## Method 2

With this method the end result will work also when the story is played locally
from the filesystem. Choose this if you plan on sharing the story by sending it
directly to people or if you don't want to install a local server on your 
computer.  

1. Download necessary files as in method 1 above (steps 1-3) but name the file 
"story.js".

2. Open the story file (story.js) and at the start add this:
    ``` 
    window.book =
    ```
   The file should now look something like `window.book = {"id":"874ea6a8-b169-...`

3. Edit index.html and add this to the end of the file:
    ``` 
    <script src="story.js"></script>
    <script>
      texture.start( window.book );
    </script>
    ``` 

## Options

`texture.start` and `texture.load` accept a second parameter that is a 
configuration object.

Example of a full configuration object:

```
texture.load(
  "story.json",
  {
    coverUrl: "cover.jpg",
    from: 2,
    showTitlePage: true
  }
);
```

All properties are optional.


### `coverUrl`

*(string)* An URL to the cover picture. Can also be a 
[data URI](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs).  

    coverUrl: "http://example.com/myCover.jpg"

    
### `from`

*(number/string)* The page from where the story starts. Can either be a number 
which represents the index of the page (0 = first page) or a page id. Defaults 
to 0.

    from: "874ea6a8-b169-1ef7-08f1-c613509f54d0"
    

### `showTitlePage`

*(boolean)* If false, the title page (which contains the story title and the 
initial "tutorial" where the player must drag the "start" button on top of a 
word on the headline) will not be shown. Defaults to true.

    showTitlePage: false
    
    
# License and distribution

You are free without limitations to modify and distribute the reader code alone 
or as a part of a Texture project. It's considered courteous not to remove the 
link to [texturewriter.com](https://texturewriter.com).